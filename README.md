# SAUCE 

Idea de esquema del ambiente de trabajo

## Estructura del proyecto

```
sauce/
├── contracts/                  ← todo lo que ya se tiene en Foundry
│   ├── src/
│   ├── lib/                    (submódulos: forge-std, openzeppelin, etc.)
│   ├── script/
│   ├── test/
│   ├── foundry.toml
│   ├── foundry.lock
│   └── .gitmodules
├── frontend/                   ← el proyecto Next.js que armé
│   ├── app/
│   ├── components/
│   ├── data/
│   ├── lib/
│   └── package.json
├── .github/
│   └── workflows/
│       ├── contracts.yml       (tu test.yml actual, con path filter)
│       └── frontend.yml        (nuevo, lint/build del frontend)
├── .gitignore                  ← uno solo en la raíz, cubre ambos
└── README.md                   ← overview del proyecto completo
```

