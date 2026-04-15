# TruuGo - Sistema de Gestão de Entregadores

## Como publicar no Vercel (passo a passo)

### Opção A — Pelo site do Vercel (mais fácil)

1. Acesse **vercel.com** e crie uma conta (pode usar Google)
2. Descompacte o arquivo `truugo-app.zip`
3. No terminal, dentro da pasta descompactada, rode:
   ```
   npm install
   npm run build
   ```
4. No Vercel, clique em **"Add New Project"** > **"Upload"**
5. Arraste a pasta **`dist`** (gerada pelo build) para o Vercel
6. Clique em **Deploy**
7. Pronto! Você terá uma URL como `truugo-xxxx.vercel.app`

### Opção B — Pelo GitHub (recomendado)

1. Crie um repositório no GitHub
2. Suba todos os arquivos deste projeto
3. No Vercel, conecte o GitHub e selecione o repositório
4. O Vercel detecta automaticamente que é um projeto Vite
5. Clique em Deploy

### Adicionar na tela do celular

1. Abra a URL no Chrome do celular
2. Clique nos **3 pontinhos** > **"Adicionar à tela inicial"**
3. O TruuGo aparece como app no celular

### Gerar APK

1. Acesse **pwabuilder.com**
2. Cole a URL do seu site
3. Clique em **"Package for stores"** > **Android**
4. Baixe o APK gerado

## Estrutura do projeto

```
truugo-app/
├── public/
│   ├── icon-192.png
│   └── icon-512.png
├── src/
│   ├── App.jsx          ← App principal
│   └── main.jsx         ← Entry point
├── index.html
├── package.json
├── vite.config.js
└── README.md
```

## Tecnologias

- React 18
- Vite 5
- PWA (Progressive Web App)
- Google Sheets API (sincronização na nuvem)
- localStorage (armazenamento local)

## Login padrão

- **ADM:** admin / admin123
- **Coordenador:** coord / coord123
- **Desenvolvedor:** dev / dev123

## by GD
