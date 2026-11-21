# FLUXSUS — protótipo

Protótipo navegável das telas do capítulo 13.

## Estrutura

- `dist/index.html`: página principal.
- `dist/styles.css`: estilos e responsividade.
- `dist/app.js`: navegação e interações.
- `dist/model.js`: regras e dados sintéticos das jornadas.
- `dist/assets/`: marcas do FLUXSUS e do SUS Navega.

## Contas de demonstração

O protótipo tem acesso demonstrativo para Paciente, Profissional e Secretariado. Use a senha `123456` com a conta escolhida na tela de acesso. A tela de Encaminhamentos internos permite registrar um encaminhamento e atualizar sua situação; uma devolução exige motivo, e a lista mostra quem alterou e quando.

Os dados ficam neste navegador e são apenas para demonstração. Não use informações reais de pacientes.

## Como abrir

Para uma visualização simples, abra `dist/index.html` no navegador.

Para executar como projeto local, abra um terminal nesta pasta e sirva o diretório `dist` com qualquer servidor HTTP estático.

Exemplo com Python:

```powershell
python -m http.server 4173 --directory dist
```

Depois, acesse `http://127.0.0.1:4173/`.
