import React, { useState, useEffect, useCallback } from "react";
import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { getFirestore, doc, setDoc, getDoc } from "firebase/firestore";
import { getAnalytics } from "firebase/analytics";

// Função auxiliar para converter a data de 'DD-MM-YYYY' para 'YYYY-MM-DD'
const parseDate = (dateStr) => {
  const [day, month, year] = dateStr.split("-");
  return new Date(`${year}-${month}-${day}`);
};

// Matérias que servem de base para o plano de estudos
const subjects = [
  "Linguagens",
  "Ciências Humanas",
  "Ciências da Natureza",
  "Matemática",
  "Redação",
];

// Lista de tópicos de exemplo para o caso de a API falhar.
const sampleTopics = {
  Linguagens: [
    "Interpretação de Textos",
    "Gêneros Textuais",
    "Literatura Brasileira",
  ],
  "Ciências Humanas": [
    "História do Brasil",
    "Geografia do Brasil",
    "Sociologia",
  ],
  "Ciências da Natureza": [
    "Física: Eletrodinâmica",
    "Química: Ligações Químicas",
    "Biologia: Ecologia",
  ],
  Matemática: ["Análise Combinatória", "Funções", "Geometria Espacial"],
  Redação: ["Estrutura Dissertativo-Argumentativa", "Repertório Sociocultural"],
};

// Esta função calcula o número de semanas até o ENEM
const calculateWeeksUntilENEM = () => {
  const today = new Date();
  const enemDate = parseDate("03-11-2025"); // Data aproximada do 1º dia de prova
  const diffTime = Math.abs(enemDate - today);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24 * 7));
};

const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
  measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID,
};

// Adicione antes da função App:
const normalizeDayName = (day) => {
  const map = {
    "Segunda-feira": "Segunda",
    "Terça-feira": "Terça",
    "Quarta-feira": "Quarta",
    "Quinta-feira": "Quinta",
    "Sexta-feira": "Sexta",
    Sábado: "Sábado",
    Domingo: "Domingo",
    Segunda: "Segunda",
    Terça: "Terça",
    Quarta: "Quarta",
    Quinta: "Quinta",
    Sexta: "Sexta",
  };
  return map[day] || day;
};

const App = () => {
  const [userId, setUserId] = useState(null);
  const [db, setDb] = useState(null);
  const [showForm, setShowForm] = useState(true);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [hoursPerDay, setHoursPerDay] = useState(2);
  const [subjectDifficulties, setSubjectDifficulties] = useState(
    subjects.reduce((acc, subject) => ({ ...acc, [subject]: 3 }), {})
  );
  const [studyPlan, setStudyPlan] = useState(null);
  const [currentWeek, setCurrentWeek] = useState(1); // ou a semana inicial do usuário
  const [isSaturday, setIsSaturday] = useState(false);

  // Função auxiliar para obter a referência correta do documento no Firestore
  const getStudyPlanRef = (dbInstance, userId, week) => {
    // Estrutura recomendada: users/{userId}/studyPlans/plan-{week}
    return doc(dbInstance, "users", userId, "studyPlans", `plan-${week}`);
  };

  // Hook para inicializar o Firebase e o estado do usuário usando as variáveis globais do Canvas.
  useEffect(() => {
    const initializeFirebase = async () => {
      try {
        const app = initializeApp(firebaseConfig);
        const authInstance = getAuth(app);
        const dbInstance = getFirestore(app);
        const analytics = getAnalytics(app);

        setDb(dbInstance);

        await signInAnonymously(authInstance);

        const user = authInstance.currentUser;
        setUserId(user ? user.uid : `anon-${crypto.randomUUID()}`);
        setLoading(false);
      } catch (e) {
        console.error("Erro ao inicializar Firebase:", e);
        setMessage(`Erro ao carregar o aplicativo: ${e.message}.`);
        setLoading(false);
      }
    };

    initializeFirebase();
  }, []); // ou apenas com as dependências realmente necessárias

  const generateSeminar = useCallback(async () => {
    if (studyPlan.completedDays.length < 6) {
      setMessage(
        "A semana não foi concluída. Marque todos os dias como feitos para gerar o seminário."
      );
      return;
    }
    setLoading(true);
    setMessage("Gerando o tema detalhado do seu seminário semanal...");

    const difficultSubjects = Object.keys(studyPlan.difficulties)
      .filter((subject) => studyPlan.difficulties[subject] >= 4)
      .join(", ");

    const prompt = `Você é um tutor de estudos para o ENEM. Um aluno do 2º ano do ensino médio tem dificuldades com as seguintes matérias: ${difficultSubjects}. Baseado nisso, sugira um tema detalhado para um "seminário de sábado" que foque em um desses tópicos. Forneça o plano do seminário como um objeto JSON. Inclua um título, um tópico principal, 2 a 3 sub-tópicos com uma breve descrição para cada, e uma analogia simples para ajudar na compreensão. Use dados abertos e amplamente disponíveis sobre o ENEM.`;

    const responseSchema = {
      type: "OBJECT",
      properties: {
        title: { type: "STRING" },
        mainTopic: { type: "STRING" },
        subTopics: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              name: { type: "STRING" },
              description: { type: "STRING" },
            },
          },
        },
        analogy: { type: "STRING" },
      },
      propertyOrdering: ["title", "mainTopic", "subTopics", "analogy"],
    };

    let retries = 0;
    const maxRetries = 5;
    const delay = (ms) => new Promise((res) => setTimeout(res, ms));
    let newSeminar = null;

    while (retries < maxRetries) {
      try {
        const payload = {
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: responseSchema,
          },
        };
        const apiKey = process.env.REACT_APP_GEMINI_API_KEY || "";
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;

        const response = await fetch(apiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const result = await response.json();
        const jsonText = result?.candidates?.[0]?.content?.parts?.[0]?.text;
        newSeminar = JSON.parse(jsonText);

        break;
      } catch (error) {
        console.error(
          `Tentativa ${retries + 1} falhou. Erro na chamada da API:`,
          error
        );
        retries++;
        if (retries < maxRetries) {
          await delay(Math.pow(2, retries) * 1000);
        } else {
          setMessage(
            "Erro ao gerar o tema do seminário. Verifique sua conexão e tente novamente."
          );
          setLoading(false);
          return;
        }
      }
    }

    try {
      const studyPlanRef = getStudyPlanRef(db, userId, currentWeek);
      await setDoc(
        studyPlanRef,
        { ...studyPlan, seminar: newSeminar },
        { merge: true }
      );

      setStudyPlan((prevPlan) => ({
        ...prevPlan,
        seminar: newSeminar,
      }));
      setLoading(false);
      setMessage("Seminário gerado com sucesso!");
    } catch (e) {
      console.error("Erro ao salvar plano de estudo:", e);
      setMessage("Erro ao salvar o seminário. Tente novamente.");
      setLoading(false);
    }
  }, [studyPlan, userId, db, currentWeek]);

  // Usei `useCallback` para memorizar a função e evitar o warning de dependência do `useEffect`.
  const generatePlan = useCallback(async () => {
    setLoading(true);
    setMessage("Gerando sua rotina de estudos detalhada...");

    const daysOfWeek = [
      "Segunda",
      "Terça",
      "Quarta",
      "Quinta",
      "Sexta",
      "Sábado",
    ];

    const prompt = `Crie um plano de estudos semanal para o ENEM (de segunda a sábado) para um aluno do 2º ano do ensino médio. O aluno tem ${hoursPerDay} horas para estudar por dia. As dificuldades dele nas matérias (1-5, onde 5 é mais difícil) são: ${JSON.stringify(
      subjectDifficulties
    )}. O plano deve conter para cada dia: o dia da semana, uma ou duas matérias, e para cada matéria, um tópico principal e 2-3 sub-tópicos específicos. Além disso, inclua uma breve descrição ou objetivo para cada dia de estudo. Use dados abertos e amplamente disponíveis sobre o ENEM. A resposta deve ser um JSON válido no formato do schema abaixo.`;

    const responseSchema = {
      type: "OBJECT",
      properties: {
        weeklyPlan: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              day: { type: "STRING" },
              schedule: {
                type: "ARRAY",
                items: {
                  type: "OBJECT",
                  properties: {
                    subject: { type: "STRING" },
                    mainTopic: { type: "STRING" },
                    subTopics: {
                      type: "ARRAY",
                      items: { type: "STRING" },
                    },
                    description: { type: "STRING" },
                  },
                },
              },
            },
            propertyOrdering: ["day", "schedule"],
          },
        },
      },
    };

    let retries = 0;
    const maxRetries = 5;
    const delay = (ms) => new Promise((res) => setTimeout(res, ms));
    let newPlan = {};
    let generationSucceeded = false;

    while (retries < maxRetries) {
      try {
        const payload = {
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: responseSchema,
          },
        };
        const apiKey = process.env.REACT_APP_GEMINI_API_KEY || "";
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;

        const response = await fetch(apiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const result = await response.json();
        const jsonText = result?.candidates?.[0]?.content?.parts?.[0]?.text;
        const parsedJson = JSON.parse(jsonText);

        newPlan = parsedJson.weeklyPlan.reduce((acc, dayPlan) => {
          const normalizedDay = normalizeDayName(dayPlan.day);
          acc[normalizedDay] = dayPlan.schedule;
          return acc;
        }, {});

        const daysOfWeek = [
          "Segunda",
          "Terça",
          "Quarta",
          "Quinta",
          "Sexta",
          "Sábado",
        ];

        daysOfWeek.forEach((day) => {
          if (!newPlan[day]) {
            newPlan[day] = [
              {
                materia: "Matéria Exemplo",
                topicos: ["Tópico 1", "Tópico 2"],
              },
            ];
          }
        });

        generationSucceeded = true;
        break;
      } catch (error) {
        console.error(
          `Tentativa ${retries + 1} falhou. Erro na chamada da API:`,
          error
        );
        retries++;
        if (retries < maxRetries) {
          await delay(Math.pow(2, retries) * 1000);
        }
      }
    }

    if (!generationSucceeded) {
      newPlan = daysOfWeek.reduce((acc, day) => {
        const subjectsToStudy = Object.keys(subjectDifficulties).sort(
          (a, b) => subjectDifficulties[b] - subjectDifficulties[a]
        );
        const subject =
          subjectsToStudy[Math.floor(Math.random() * subjectsToStudy.length)];
        const topic =
          sampleTopics[subject][
            Math.floor(Math.random() * sampleTopics[subject].length)
          ];
        acc[day] = [
          {
            subject: subject,
            mainTopic: topic,
            subTopics: ["Sub-tópico 1", "Sub-tópico 2"],
            description: "Revisão geral do tema",
          },
        ];
        return acc;
      }, {});
      setMessage("Erro ao gerar plano detalhado. Gerando um plano básico.");
    }

    const newStudyPlan = {
      hours: hoursPerDay,
      difficulties: subjectDifficulties,
      plan: newPlan,
      completedDays: [],
      week: currentWeek,
    };

    try {
      const studyPlanRef = getStudyPlanRef(db, userId, currentWeek);
      await setDoc(studyPlanRef, newStudyPlan);

      setStudyPlan(newStudyPlan);
      setShowForm(false);
      if (generationSucceeded) {
        setMessage("Plano de estudo gerado e salvo com sucesso!");
      }
    } catch (e) {
      console.error("Erro ao salvar plano de estudo:", e);
      setMessage("Erro ao salvar o plano de estudo. Tente novamente.");
      setStudyPlan(newStudyPlan);
      setShowForm(false);
    }
    setLoading(false);
  }, [hoursPerDay, subjectDifficulties, currentWeek, userId, db]);

  // Hook que monitora a data e carrega o plano de estudos da semana atual
  useEffect(() => {
    if (!userId || !db) return;

    const today = new Date();
    const dayOfWeek = today.getDay(); // 0 = Domingo, 6 = Sábado
    setIsSaturday(dayOfWeek === 6);

    const checkStudyPlan = async () => {
      setLoading(true);
      const studyPlanRef = getStudyPlanRef(db, userId, currentWeek);

      try {
        const docSnap = await getDoc(studyPlanRef);
        if (docSnap.exists()) {
          setStudyPlan(docSnap.data());
          setShowForm(false);
        } else {
          // Só gera o plano se ainda não existe
          await generatePlan();
          setShowForm(true);
        }
      } catch (e) {
        console.error("Erro ao carregar plano de estudo:", e);
        setMessage(
          "Erro ao carregar o plano de estudo. Por favor, tente novamente."
        );
      }
      setLoading(false);
    };

    checkStudyPlan();
  }, [userId, db, currentWeek]); // Remova generatePlan daqui

  const markAsDone = async (day) => {
    const updatedCompletedDays = [...studyPlan.completedDays, day];
    const updatedPlan = { ...studyPlan, completedDays: updatedCompletedDays };

    try {
      const studyPlanRef = getStudyPlanRef(db, userId, currentWeek);
      await setDoc(studyPlanRef, updatedPlan, { merge: true });

      setStudyPlan(updatedPlan);
      setMessage(`${day} marcado como concluído!`);
    } catch (e) {
      console.error("Erro ao atualizar o plano:", e);
      setMessage("Erro ao marcar como concluído. Tente novamente.");
    }
  };

  const handleNextWeek = () => {
    setCurrentWeek(currentWeek + 1);
    setStudyPlan(null); // Limpa o plano para que o novo formulário seja exibido.
    setShowForm(true);
  };

  const handleRestart = async () => {
    setCurrentWeek(1);
    if (!db || !userId) return;
    const studyPlanRef = getStudyPlanRef(db, userId, 1);
    try {
      const docSnap = await getDoc(studyPlanRef);
      if (docSnap.exists()) {
        const planData = docSnap.data();
        await setDoc(
          studyPlanRef,
          { ...planData, completedDays: [] },
          { merge: true }
        );
        setStudyPlan({ ...planData, completedDays: [] });
        setMessage("Progresso da semana 1 reiniciado!");
      }
    } catch (e) {
      setMessage("Erro ao reiniciar o progresso.");
    }
  };


  const renderContent = () => {
    if (loading) {
      return (
        <div className="flex justify-center items-center h-full">
          <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-indigo-500"></div>
        </div>
      );
    }

    if (isSaturday && studyPlan?.seminar) {
      const seminar = studyPlan.seminar;
      return (
        <div className="p-8 bg-white rounded-lg shadow-xl text-center">
          <h2 className="text-3xl font-bold mb-4 text-indigo-700">
            Seminário da Semana!
          </h2>
          <div className="flex flex-col space-y-4 mb-6 text-left">
            <h3 className="text-2xl font-bold text-gray-800">
              {seminar.title}
            </h3>
            <p className="text-md font-semibold text-indigo-600">
              {seminar.mainTopic}
            </p>
            <ul className="list-disc list-inside text-gray-600 text-sm space-y-2">
              {seminar.subTopics?.map((sub, subIndex) => (
                <li key={subIndex}>
                  <span className="font-semibold">{sub.name}:</span>{" "}
                  {sub.description}
                </li>
              ))}
            </ul>
            <p className="text-sm text-gray-700 italic mt-4">
              <span className="font-semibold">Analogia:</span> {seminar.analogy}
            </p>
          </div>
          <button
            onClick={handleNextWeek}
            className="px-6 py-3 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 transition duration-300"
          >
            Gerar Plano para Próxima Semana
          </button>
        </div>
      );
    }

    if (showForm) {
      return (
        <div className="p-8 bg-white rounded-lg shadow-xl">
          <h2 className="text-2xl font-bold mb-6 text-indigo-800">
            Crie seu Plano de Estudos
          </h2>
          <p className="text-gray-600 mb-4">
            Total de semanas até o ENEM 2025:{" "}
            <span className="font-semibold">{calculateWeeksUntilENEM()}</span>
          </p>
          <div className="mb-6">
            <label className="block text-gray-700 font-medium mb-2">
              Horas de Estudo por dia (Segunda a Sábado):
            </label>
            <input
              type="number"
              min="1"
              max="10"
              value={hoursPerDay}
              onChange={(e) => setHoursPerDay(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="mb-6">
            <h3 className="text-lg font-medium text-gray-700 mb-2">
              Sua Dificuldade por Matéria (1-5)
            </h3>
            {subjects.map((subject) => (
              <div key={subject} className="mb-4">
                <label className="block text-gray-600">{subject}</label>
                <div className="flex items-center space-x-2">
                  <input
                    type="range"
                    min="1"
                    max="5"
                    value={subjectDifficulties[subject]}
                    onChange={(e) =>
                      setSubjectDifficulties({
                        ...subjectDifficulties,
                        [subject]: parseInt(e.target.value),
                      })
                    }
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer range-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <span className="text-gray-700 font-semibold">
                    {subjectDifficulties[subject]}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={generatePlan}
            className="w-full px-6 py-3 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 transition duration-300 shadow-md"
          >
            Gerar Plano Semanal
          </button>
        </div>
      );
    }

    if (studyPlan) {
      const daysOfWeek = [
        "Segunda",
        "Terça",
        "Quarta",
        "Quinta",
        "Sexta",
        "Sábado",
      ];
      return (
        <div className="p-8 bg-white rounded-lg shadow-xl">
          <h2 className="text-2xl font-bold mb-6 text-indigo-800">
            Sua Rotina Semanal Detalhada
          </h2>
          <p className="text-gray-600 mb-4">
            ID do Usuário: <span className="font-mono text-xs">{userId}</span>
          </p>
          <div className="grid md:grid-cols-2 gap-6">
            {daysOfWeek.map((day) => (
              <div
                key={day}
                className="bg-gray-50 p-6 rounded-lg border border-gray-200 shadow-sm"
              >
                <h3 className="text-lg font-bold text-gray-800 mb-2">{day}</h3>
                <p className="text-sm text-gray-500 mb-4">
                  {studyPlan.hours} hora(s) de estudo
                </p>
                {studyPlan.plan[day] && studyPlan.plan[day].length > 0 ? (
                  studyPlan.plan[day].map((item, index) => (
                    <div
                      key={index}
                      className="flex flex-col space-y-1 mb-4 border-l-4 border-indigo-400 pl-4"
                    >
                      <p className="text-md font-semibold text-indigo-600">
                        {item.subject}: {item.mainTopic}
                      </p>
                      <p className="text-sm text-gray-700 italic">
                        {item.description}
                      </p>
                      <ul className="list-disc list-inside text-gray-600 text-sm">
                        {item.subTopics?.map((sub, subIndex) => (
                          <li key={subIndex}>{sub}</li>
                        ))}
                      </ul>
                    </div>
                  ))
                ) : (
                  <p>Nenhum conteúdo para este dia.</p>
                )}
                <button
                  onClick={() => markAsDone(day)}
                  disabled={studyPlan.completedDays.includes(day)}
                  className={`mt-4 w-full py-2 rounded-lg font-semibold transition duration-300 ${
                    studyPlan.completedDays.includes(day)
                      ? "bg-green-500 text-white cursor-not-allowed"
                      : "bg-indigo-500 text-white hover:bg-indigo-600"
                  }`}
                >
                  {studyPlan.completedDays.includes(day)
                    ? "Concluído!"
                    : "Marcar como Concluído"}
                </button>
              </div>
            ))}
          </div>
          <div className="mt-8 text-center">
            <button
              onClick={handleNextWeek}
              className="px-6 py-3 bg-gray-300 text-gray-800 rounded-lg font-semibold hover:bg-gray-400 transition duration-300"
            >
              Avançar para a Próxima Semana
            </button>
          </div>
        </div>
      );
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-4 md:p-8 flex items-center justify-center font-sans">
      <div className="max-w-4xl w-full">
        <header className="text-center mb-8">
          <h1 className="text-4xl font-extrabold text-indigo-900">
            Plano de Estudos ENEM 2025
          </h1>
          <p className="text-lg text-gray-600 mt-2">
            Organize sua rotina, acompanhe seu progresso e conquiste a
            aprovação!
          </p>
          <p className="text-sm text-gray-500 mt-2">
            ID do usuário: <span className="font-mono">{userId}</span>
          </p>
        </header>

        <div className="flex items-center justify-center gap-4 my-6">
          <button
            className="px-4 py-2 bg-violet-200 text-violet-700 rounded-lg shadow hover:bg-violet-300 transition"
            onClick={() => setCurrentWeek((w) => Math.max(1, w - 1))}
          >
            ← Semana anterior
          </button>
          <span className="font-semibold text-lg text-violet-800">
            Semana {currentWeek}
          </span>
          <button
            className="px-4 py-2 bg-violet-200 text-violet-700 rounded-lg shadow hover:bg-violet-300 transition"
            onClick={() => setCurrentWeek((w) => w + 1)}
          >
            Próxima semana →
          </button>
          <button
            className="px-4 py-2 bg-white border border-violet-300 text-violet-700 rounded-lg shadow hover:bg-violet-100 transition"
            onClick={handleRestart}
          >
            Recomeçar
          </button>
        </div>

        {studyPlan && (
          <div className="flex items-center justify-center mb-6">
            <span className="text-violet-700 font-medium bg-violet-100 px-4 py-2 rounded-full shadow">
              {studyPlan.completedDays.length} de 6 dias concluídos nesta semana
            </span>
          </div>
        )}

        {renderContent()}

        {message && (
          <div className="fixed bottom-4 left-1/2 -translate-x-1/2 p-4 rounded-lg text-white font-semibold shadow-lg transition-transform duration-300 bg-indigo-600">
            {message}
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
