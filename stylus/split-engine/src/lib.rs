// SPDX-License-Identifier: MIT
//
// Motor de reparto de ingresos para SAUCE, en Arbitrum Stylus.
//
// Que hace: recibe un lote de ventas ya cobradas en fiat y lo colapsa a un monto
// por creador, aplicando las reglas de reparto de cada obra (co-autores, splits
// por region). Devuelve el resultado a SettlementVault, que es quien custodia y
// paga. Este contrato nunca toca dinero.
//
// Por que Stylus y no Solidity: la ventaja real no son las transferencias —esas
// cuestan lo mismo en cualquier lenguaje porque el costo es de storage—, sino la
// agregacion previa. Colapsar 10.000 ventas a 200 creadores en Solidity obliga a
// escribir en storage o a hacer crecer memoria de forma cuadratica. En Stylus el
// mapa vive en memoria WASM, que es dramaticamente mas barata, y solo se escribe
// una vez por creador. La ganancia crece con el tamano del lote; en lotes chicos
// Stylus no compensa su overhead de activacion.

#![cfg_attr(not(any(test, feature = "export-abi")), no_main)]

extern crate alloc;

use alloc::{collections::BTreeMap, vec::Vec};

use stylus_sdk::{
    alloy_primitives::{Address, U256},
    alloy_sol_types::sol,
    msg,
    prelude::*,
};

/// Version del formato de lote. Va en el primer byte para que un backend viejo
/// contra un motor nuevo falle de forma ruidosa en vez de malinterpretar bytes.
const FORMAT_VERSION: u8 = 1;

/// version(1) + recordCount(2)
const HEADER_LEN: usize = 3;

/// contentId(8) + region(2) + amount(16)
const RECORD_LEN: usize = 26;

const BPS_DENOMINATOR: u32 = 10_000;

/// Region neutra: el reparto por defecto de la obra.
const REGION_DEFAULT: u16 = 0;

sol_storage! {
    #[entrypoint]
    pub struct SplitEngine {
        address owner;

        /// key = (contentId << 16) | region  ->  reparto.
        ///
        /// Un solo mapping en vez de uno anidado: la clave compuesta mantiene el
        /// layout plano y hace que "reparto por defecto" y "reparto por region"
        /// sean el mismo camino de codigo, con region 0 como neutro.
        mapping(uint256 => Payee[]) splits;
    }

    pub struct Payee {
        address recipient;
        uint16 bps;
    }
}

sol! {
    error NotOwner();
    error UnsupportedVersion(uint8 found, uint8 expected);
    error MalformedBatch();
    error EmptyBatch();
    error ZeroSaleAmount(uint256 recordIndex);
    error NoSplitConfigured(uint256 contentId, uint16 region);
    error LengthMismatch();
    error BpsMustSumToDenominator(uint32 got);
    error ZeroRecipient();
    error ZeroBps();
}

#[derive(SolidityError)]
pub enum SplitError {
    NotOwner(NotOwner),
    UnsupportedVersion(UnsupportedVersion),
    MalformedBatch(MalformedBatch),
    EmptyBatch(EmptyBatch),
    ZeroSaleAmount(ZeroSaleAmount),
    NoSplitConfigured(NoSplitConfigured),
    LengthMismatch(LengthMismatch),
    BpsMustSumToDenominator(BpsMustSumToDenominator),
    ZeroRecipient(ZeroRecipient),
    ZeroBps(ZeroBps),
}

#[public]
impl SplitEngine {
    /// Fija al primer llamante como owner. Idempotente por diseno: una segunda
    /// llamada solo la puede hacer el owner actual.
    pub fn initialize(&mut self, owner: Address) -> Result<(), SplitError> {
        let current = self.owner.get();

        if current != Address::ZERO && current != msg::sender() {
            return Err(SplitError::NotOwner(NotOwner {}));
        }

        self.owner.set(owner);

        Ok(())
    }

    pub fn owner(&self) -> Address {
        self.owner.get()
    }

    /// Define el reparto de una obra, opcionalmente acotado a una region.
    ///
    /// `region = 0` es el reparto por defecto y es el que se usa cuando una venta
    /// llega con una region sin configuracion propia.
    pub fn set_split(
        &mut self,
        content_id: u64,
        region: u16,
        recipients: Vec<Address>,
        bps: Vec<u16>,
    ) -> Result<(), SplitError> {
        self.only_owner()?;

        if recipients.len() != bps.len() {
            return Err(SplitError::LengthMismatch(LengthMismatch {}));
        }
        if recipients.is_empty() {
            return Err(SplitError::EmptyBatch(EmptyBatch {}));
        }

        let mut total: u32 = 0;
        for i in 0..recipients.len() {
            if recipients[i] == Address::ZERO {
                return Err(SplitError::ZeroRecipient(ZeroRecipient {}));
            }
            if bps[i] == 0 {
                return Err(SplitError::ZeroBps(ZeroBps {}));
            }
            total += bps[i] as u32;
        }

        // Sin esto, un reparto que sume menos de 10.000 dejaria dinero sin asignar
        // y el total declarado no cuadraria con lo que la boveda recibe.
        if total != BPS_DENOMINATOR {
            return Err(SplitError::BpsMustSumToDenominator(
                BpsMustSumToDenominator { got: total },
            ));
        }

        let key = split_key(content_id, region);
        let mut slot = self.splits.setter(key);

        // Se reemplaza entero, no se hace merge: un reparto parcialmente
        // sobrescrito es la clase de bug que paga de menos y nadie nota.
        while slot.len() > 0 {
            slot.pop();
        }

        for i in 0..recipients.len() {
            let mut entry = slot.grow();
            entry.recipient.set(recipients[i]);
            entry.bps.set(alloy_u16(bps[i]));
        }

        Ok(())
    }

    /// Numero de beneficiarios configurados para (obra, region).
    pub fn split_len(&self, content_id: u64, region: u16) -> U256 {
        U256::from(self.splits.get(split_key(content_id, region)).len())
    }

    /// Implementa `ISplitEngine.aggregate`. Es `view`: no muta nada, la boveda la
    /// llama para calcular y despues valida el resultado por su cuenta.
    ///
    /// Formato de `sales` (big endian, sin padding — en Arbitrum el calldata se
    /// publica en L1 y es el costo dominante, asi que se empaqueta al hueso):
    ///
    /// ```text
    ///   [0]      version = 1
    ///   [1..3]   recordCount : u16
    ///   luego recordCount registros de 26 bytes:
    ///     [0..8]   contentId : u64
    ///     [8..10]  region    : u16
    ///     [10..26] amount    : u128   (unidad minima del token, 6 dec para USDC)
    /// ```
    pub fn aggregate(
        &self,
        sales: Vec<u8>,
    ) -> Result<(Vec<Address>, Vec<U256>, U256), SplitError> {
        if sales.len() < HEADER_LEN {
            return Err(SplitError::MalformedBatch(MalformedBatch {}));
        }

        if sales[0] != FORMAT_VERSION {
            return Err(SplitError::UnsupportedVersion(UnsupportedVersion {
                found: sales[0],
                expected: FORMAT_VERSION,
            }));
        }

        let count = u16::from_be_bytes([sales[1], sales[2]]) as usize;

        if count == 0 {
            return Err(SplitError::EmptyBatch(EmptyBatch {}));
        }

        // Longitud exacta, no minima: un lote con bytes de sobra significa que el
        // backend y el motor no coinciden en el formato.
        if sales.len() != HEADER_LEN + count * RECORD_LEN {
            return Err(SplitError::MalformedBatch(MalformedBatch {}));
        }

        // BTreeMap y no HashMap: la salida queda ordenada por direccion de forma
        // determinista, asi el mismo lote produce siempre el mismo calldata y se
        // puede comparar contra lo que calculo el backend.
        let mut totals: BTreeMap<Address, U256> = BTreeMap::new();
        let mut total_gross = U256::ZERO;

        for index in 0..count {
            let offset = HEADER_LEN + index * RECORD_LEN;
            let record = &sales[offset..offset + RECORD_LEN];

            let content_id = u64::from_be_bytes(
                record[0..8]
                    .try_into()
                    .map_err(|_| SplitError::MalformedBatch(MalformedBatch {}))?,
            );
            let region = u16::from_be_bytes([record[8], record[9]]);
            let amount_raw = u128::from_be_bytes(
                record[10..26]
                    .try_into()
                    .map_err(|_| SplitError::MalformedBatch(MalformedBatch {}))?,
            );

            if amount_raw == 0 {
                return Err(SplitError::ZeroSaleAmount(ZeroSaleAmount {
                    recordIndex: U256::from(index),
                }));
            }

            let amount = U256::from(amount_raw);
            total_gross += amount;

            self.allocate(content_id, region, amount, &mut totals)?;
        }

        let mut payees: Vec<Address> = Vec::with_capacity(totals.len());
        let mut amounts: Vec<U256> = Vec::with_capacity(totals.len());

        for (payee, amount) in totals.into_iter() {
            // Un beneficiario con bps chico puede quedar en cero si todas las
            // ventas del lote fueron de importe minimo. Se omite: la boveda
            // rechaza montos cero, y omitirlo no altera la suma.
            if amount.is_zero() {
                continue;
            }

            payees.push(payee);
            amounts.push(amount);
        }

        Ok((payees, amounts, total_gross))
    }
}

impl SplitEngine {
    fn only_owner(&self) -> Result<(), SplitError> {
        if msg::sender() != self.owner.get() {
            return Err(SplitError::NotOwner(NotOwner {}));
        }

        Ok(())
    }

    /// Reparte el importe de una venta entre los beneficiarios de la obra.
    fn allocate(
        &self,
        content_id: u64,
        region: u16,
        amount: U256,
        totals: &mut BTreeMap<Address, U256>,
    ) -> Result<(), SplitError> {
        let mut key = split_key(content_id, region);
        let mut split = self.splits.get(key);

        // Sin reparto propio para la region, cae al reparto por defecto.
        if split.len() == 0 && region != REGION_DEFAULT {
            key = split_key(content_id, REGION_DEFAULT);
            split = self.splits.get(key);
        }

        let len = split.len();

        if len == 0 {
            return Err(SplitError::NoSplitConfigured(NoSplitConfigured {
                contentId: U256::from(content_id),
                region,
            }));
        }

        let mut distributed = U256::ZERO;

        for i in 0..len {
            let entry = split.get(i).expect("index < len");
            let recipient = entry.recipient.get();
            let bps = entry.bps.get().to::<u32>();

            // Al ultimo le toca el resto en vez de su porcentaje. Es lo que hace
            // que la suma de las partes sea exactamente el importe de la venta:
            // sin esto, el redondeo hacia abajo deja polvo sin asignar y la
            // boveda revierte porque el total declarado no cuadra.
            let share = if i == len - 1 {
                amount - distributed
            } else {
                amount * U256::from(bps) / U256::from(BPS_DENOMINATOR)
            };

            distributed += share;

            let slot = totals.entry(recipient).or_insert(U256::ZERO);
            *slot += share;
        }

        Ok(())
    }
}

/// Empaqueta (obra, region) en una sola clave de storage.
fn split_key(content_id: u64, region: u16) -> U256 {
    (U256::from(content_id) << 16) | U256::from(region)
}

/// `bps` se guarda como `uint16` de Solidity; el setter espera el tipo de alloy.
fn alloy_u16(value: u16) -> stylus_sdk::alloy_primitives::Uint<16, 1> {
    stylus_sdk::alloy_primitives::Uint::<16, 1>::from(value)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn encode(records: &[(u64, u16, u128)]) -> Vec<u8> {
        let mut out = Vec::with_capacity(HEADER_LEN + records.len() * RECORD_LEN);

        out.push(FORMAT_VERSION);
        out.extend_from_slice(&(records.len() as u16).to_be_bytes());

        for (content_id, region, amount) in records {
            out.extend_from_slice(&content_id.to_be_bytes());
            out.extend_from_slice(&region.to_be_bytes());
            out.extend_from_slice(&amount.to_be_bytes());
        }

        out
    }

    #[test]
    fn header_and_record_sizes_are_stable() {
        let blob = encode(&[(1, 0, 1_000_000), (2, 51, 2_500_000)]);

        assert_eq!(blob.len(), HEADER_LEN + 2 * RECORD_LEN);
        assert_eq!(blob[0], FORMAT_VERSION);
        assert_eq!(u16::from_be_bytes([blob[1], blob[2]]), 2);
    }

    #[test]
    fn split_key_is_injective() {
        assert_ne!(split_key(1, 0), split_key(0, 1));
        assert_eq!(split_key(1, 0), U256::from(65_536u32));
        assert_eq!(split_key(1, 5), U256::from(65_541u32));
    }
}
