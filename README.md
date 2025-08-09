# 📚 Plano de Estudos ENEM 2025

Organize sua rotina, acompanhe seu progresso e conquiste a aprovação no ENEM!

![Preview](public/logo192.png)

---

## ✨ Sobre o Projeto

O **Plano de Estudos ENEM 2025** é uma aplicação web que gera rotinas semanais de estudo personalizadas para o ENEM, baseada nas suas dificuldades e preferências. O app utiliza React, Firebase (Firestore e Auth), TailwindCSS para o visual e a API Gemini para geração inteligente dos planos.

---

## 🚀 Funcionalidades

- Geração automática de plano de estudos semanal
- Personalização conforme dificuldades do usuário
- Marcação de tarefas como concluídas
- Salvamento seguro dos dados na nuvem (Firestore)
- Interface responsiva e moderna com TailwindCSS

---

## 🛠️ Tecnologias Utilizadas

- [React](https://react.dev/)
- [Firebase (Firestore & Auth)](https://firebase.google.com/)
- [TailwindCSS](https://tailwindcss.com/)
- [Google Gemini API](https://ai.google.dev/gemini-api/docs)
- [Create React App](https://create-react-app.dev/)

---

## ⚡ Como rodar o projeto localmente

1. **Clone o repositório**

   ```sh
   git clone https://github.com/seu-usuario/enem-study-plan.git
   cd enem-study-plan
   ```

2. **Instale as dependências**

   ```sh
   npm install
   ```

3. **Configure as variáveis de ambiente**

   - Crie um arquivo `.env.local` na raiz do projeto com as chaves do Firebase e Gemini:
     ```
     REACT_APP_FIREBASE_API_KEY=...
     REACT_APP_FIREBASE_AUTH_DOMAIN=...
     REACT_APP_FIREBASE_PROJECT_ID=...
     REACT_APP_FIREBASE_STORAGE_BUCKET=...
     REACT_APP_FIREBASE_MESSAGING_SENDER_ID=...
     REACT_APP_FIREBASE_APP_ID=...
     REACT_APP_FIREBASE_MEASUREMENT_ID=...
     REACT_APP_GEMINI_API_KEY=...
     ```

4. **Inicie o servidor de desenvolvimento**
   ```sh
   npm start
   ```
   O app estará disponível em [http://localhost:3000](http://localhost:3000).

---

## ☁️ Deploy no Firebase Hosting

1. **Gere o build de produção**

   ```sh
   npm run build
   ```

2. **Faça o deploy**
   ```sh
   firebase deploy
   ```
   O terminal mostrará a URL do seu site hospedado.

---

## 🔒 Segurança

- **Regras do Firestore:**  
  Por padrão, as regras permitem acesso total até 06/09/2025.  
  **Recomenda-se fortemente** atualizar para:
  ```js
  service cloud.firestore {
    match /databases/{database}/documents {
      match /users/{userId}/studyPlans/{planId} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }
    }
  }
  ```
- **Chave Gemini:**  
  Restrinja o uso da chave Gemini por domínio no Google Cloud Console.
- **HTTPS:**  
  O Firebase Hosting já utiliza HTTPS por padrão.

---

## 📝 Estrutura do Projeto

```
enem-study-plan/
├── public/
├── src/
│   ├── App.js
│   ├── firebase.js
│   ├── index.js
│   └── ...
├── .env.local
├── firebase.json
├── firestore.rules
├── package.json
└── README.md
```

---

## 🧑‍💻 Contribuição

Contribuições são bem-vindas!  
Abra uma issue ou envie um pull request.

---

## 📄 Licença

Este projeto está sob a licença MIT.

---

## 📬 Contato

Dúvidas ou sugestões?  
Entre em contato
