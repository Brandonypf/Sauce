// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {CreatorRegistry} from "../src/CreatorRegistry.sol";
import {ContentRegistry} from "../src/ContentRegistry.sol";

/**
 * @title RegisterWithSigTest
 * @notice Cubre `registerContentWithSig`: el creador firma fuera de cadena y el
 *         relayer envia y paga el gas.
 *
 * @dev El caso importante no es el feliz sino los bordes. Una firma que se puede
 *      reutilizar, o que no caduca nunca, convierte la atestacion de autoria en
 *      algo que cualquiera con acceso al log puede reenviar.
 */
contract RegisterWithSigTest is Test {
    CreatorRegistry internal creators;
    ContentRegistry internal contents;

    uint256 internal creatorKey = 0xC0FFEE;
    address internal creator;

    // El relayer no es el creador. Ese es justamente el punto.
    address internal relayer = makeAddr("relayer");
    address internal admin = makeAddr("admin");

    string internal constant TITLE = "Hoshizora no Kanata";
    string internal constant URI = "ipfs://metadata";
    bytes32 internal constant HASH = keccak256("archivo-de-la-obra");
    uint256 internal constant PRICE = 10_000_000;

    function setUp() public {
        creator = vm.addr(creatorKey);

        creators = new CreatorRegistry(admin);
        contents = new ContentRegistry(address(creators));

        vm.prank(creator);
        creators.registerCreator("Estudio", "ipfs://perfil", address(0));
    }

    function _req(address who, string memory title, bytes32 contentHash, uint256 nonce, uint64 deadline)
        internal
        pure
        returns (ContentRegistry.RegisterRequest memory)
    {
        return ContentRegistry.RegisterRequest({
            creator: who,
            title: title,
            metadataURI: URI,
            contentHash: contentHash,
            referencePrice: PRICE,
            nonce: nonce,
            deadline: deadline
        });
    }

    function _sign(uint256 key, uint256 nonce, uint64 deadline, bytes32 contentHash)
        internal
        view
        returns (bytes memory)
    {
        (uint8 v, bytes32 r, bytes32 s) =
            vm.sign(key, contents.registerDigest(_req(creator, TITLE, contentHash, nonce, deadline)));

        return abi.encodePacked(r, s, v);
    }

    // ------------------------------------------------------------ camino feliz

    function testRelayerRegistersOnBehalfOfCreator() public {
        uint64 deadline = uint64(block.timestamp + 1 hours);
        bytes memory sig = _sign(creatorKey, 0, deadline, HASH);

        // Lo envia el relayer, no el creador.
        vm.prank(relayer);
        uint256 contentId = contents.registerContentWithSig(_req(creator, TITLE, HASH, 0, deadline), sig);

        assertGt(contentId, 0, "debe devolver un contentId");

        // La autoria queda en el creador aunque msg.sender fuera el relayer. Es
        // toda la razon de ser de esta funcion.
        assertEq(contents.creatorOf(contentId), creator, "el autor es el creador, no el relayer");
        assertEq(contents.contentIdByHash(HASH), contentId);
        assertEq(contents.nonces(creator), 1, "el nonce se consume");
    }

    function testDirectPathStillWorks() public {
        // `registerContent` no se rompe: ambos caminos comparten `_register`.
        vm.prank(creator);
        uint256 contentId = contents.registerContent(TITLE, URI, HASH, PRICE);

        assertEq(contents.creatorOf(contentId), creator);
        assertEq(contents.nonces(creator), 0, "el camino directo no toca el nonce");
    }

    // ------------------------------------------------------------------ bordes

    function testSignatureCannotBeReplayed() public {
        uint64 deadline = uint64(block.timestamp + 1 hours);
        bytes memory sig = _sign(creatorKey, 0, deadline, HASH);

        vm.prank(relayer);
        contents.registerContentWithSig(_req(creator, TITLE, HASH, 0, deadline), sig);

        // Reenviar la misma firma falla por nonce, no por hash duplicado. Importa
        // la distincion: el nonce es lo que protegera a `updateContent`, donde no
        // hay unicidad de hash que salve.
        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(ContentRegistry.BadNonce.selector, 1, 0));
        contents.registerContentWithSig(_req(creator, TITLE, HASH, 0, deadline), sig);
    }

    function testExpiredSignatureIsRejected() public {
        uint64 deadline = uint64(block.timestamp + 10 minutes);
        bytes memory sig = _sign(creatorKey, 0, deadline, HASH);

        vm.warp(block.timestamp + 11 minutes);

        vm.prank(relayer);
        vm.expectRevert(ContentRegistry.SignatureExpired.selector);
        contents.registerContentWithSig(_req(creator, TITLE, HASH, 0, deadline), sig);
    }

    function testSignatureFromAnotherKeyIsRejected() public {
        uint64 deadline = uint64(block.timestamp + 1 hours);

        // Un atacante firma diciendo ser el creador.
        bytes memory sig = _sign(0xBADBAD, 0, deadline, HASH);

        vm.prank(relayer);
        vm.expectRevert(ContentRegistry.InvalidSignature.selector);
        contents.registerContentWithSig(_req(creator, TITLE, HASH, 0, deadline), sig);
    }

    function testTamperedTitleInvalidatesSignature() public {
        uint64 deadline = uint64(block.timestamp + 1 hours);
        bytes memory sig = _sign(creatorKey, 0, deadline, HASH);

        // El relayer intenta publicar con otro titulo del que se firmo. El
        // digest cambia, asi que la firma recupera otra direccion.
        vm.prank(relayer);
        vm.expectRevert(ContentRegistry.InvalidSignature.selector);
        contents.registerContentWithSig(_req(creator, "Titulo cambiado", HASH, 0, deadline), sig);
    }

    function testTamperedHashInvalidatesSignature() public {
        uint64 deadline = uint64(block.timestamp + 1 hours);
        bytes memory sig = _sign(creatorKey, 0, deadline, HASH);

        // Cambiar el archivo es el ataque que mas importa: seria publicar una
        // obra distinta bajo la firma del creador.
        vm.prank(relayer);
        vm.expectRevert(ContentRegistry.InvalidSignature.selector);
        contents.registerContentWithSig(_req(creator, TITLE, keccak256("otro-archivo"), 0, deadline), sig);
    }

    function testUnregisteredCreatorCannotRegister() public {
        uint256 otraKey = 0xDECAF;
        address otro = vm.addr(otraKey);

        uint64 deadline = uint64(block.timestamp + 1 hours);

        ContentRegistry.RegisterRequest memory req = _req(otro, TITLE, HASH, 0, deadline);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(otraKey, contents.registerDigest(req));

        vm.prank(relayer);
        vm.expectRevert(ContentRegistry.CreatorNotRegistered.selector);
        contents.registerContentWithSig(req, abi.encodePacked(r, s, v));
    }

    function testDuplicateHashIsRejected() public {
        uint64 deadline = uint64(block.timestamp + 1 hours);

        vm.prank(relayer);
        uint256 first = contents.registerContentWithSig(
            _req(creator, TITLE, HASH, 0, deadline), _sign(creatorKey, 0, deadline, HASH)
        );

        // La firma se calcula ANTES de `expectRevert`: `_sign` llama a
        // `registerDigest`, y esa llamada view consumiria el expectRevert, que
        // solo mira la siguiente llamada.
        bytes memory segundaFirma = _sign(creatorKey, 1, deadline, HASH);

        // Segundo intento con nonce nuevo pero el mismo archivo.
        vm.prank(relayer);
        vm.expectRevert(abi.encodeWithSelector(ContentRegistry.DuplicateContentHash.selector, first));
        contents.registerContentWithSig(_req(creator, TITLE, HASH, 1, deadline), segundaFirma);
    }

    function testConsecutiveRegistrationsAdvanceNonce() public {
        uint64 deadline = uint64(block.timestamp + 1 hours);

        vm.prank(relayer);
        contents.registerContentWithSig(_req(creator, TITLE, HASH, 0, deadline), _sign(creatorKey, 0, deadline, HASH));

        bytes32 segundo = keccak256("segunda-obra");

        vm.prank(relayer);
        contents.registerContentWithSig(
            _req(creator, TITLE, segundo, 1, deadline), _sign(creatorKey, 1, deadline, segundo)
        );

        assertEq(contents.nonces(creator), 2);
    }

    /// @notice Cualquiera puede enviar la transaccion; solo el creador puede firmarla.
    function testAnyoneCanRelay() public {
        uint64 deadline = uint64(block.timestamp + 1 hours);
        bytes memory sig = _sign(creatorKey, 0, deadline, HASH);

        address desconocido = makeAddr("desconocido");

        vm.prank(desconocido);
        uint256 contentId = contents.registerContentWithSig(_req(creator, TITLE, HASH, 0, deadline), sig);

        assertEq(contents.creatorOf(contentId), creator);
    }
}
