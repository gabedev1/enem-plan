import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc } from 'firebase/firestore';

// Função auxiliar para converter a data de 'DD-MM-YYYY' para 'YYYY-MM-DD'
// para garantir que a data seja analisada corretamente
const parseDate = (dateStr) => {
  const [day, month, year] = dateStr.split('-');
  return new Date(`${year}-${month}-${day}`);
};

// Matérias que servem de base para o plano de estudos
const subjects = [
  "Linguagens", "Ciências Humanas", "Ciências da Natureza", "Matemática", "Redação"
];

// Lista de tópicos de exemplo para o caso de a API falhar.
const sampleTopics = {
  "Linguagens": ["Interpretação de Textos", "Gêneros Textuais", "Literatura Brasileira"],
  "Ciências Humanas": ["História do Brasil", "Geografia do Brasil", "Sociologia"],
  "Ciências da Natureza": ["Física: Eletrodinâmica", "Química: Ligações Químicas", "Biologia: Ecologia"],
  "Matemática": ["Análise Combinatória", "Funções", "Geometria Espacial"],
  "Redação": ["Estrutura Dissertativo-Argumentativa", "Repertório Sociocultural"]
};

// Esta função calcula o número de semanas até o ENEM
const calculateWeeksUntilENEM = () => {
  const today = new Date();
  const enemDate = parseDate('03-11-2025'); // Data aproximada do 1º dia de prova
  const diffTime = Math.abs(enemDate - today);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24 * 7));
};

const App = () => {
  const [userId, setUserId] = useState(null);
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [showForm, setShowForm] = useState(true);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [hoursPerDay, setHoursPerDay] = useState(2);
  const [subjectDifficulties, setSubjectDifficulties] = useState(
    subjects.reduce((acc, subject) => ({ ...acc, [subject]: 3 }), {})
  );
  const [studyPlan, setStudyPlan] = useState(null);
  const [currentWeek, setCurrentWeek] = useState(calculateWeeksUntilENEM());
  const [isSaturday, setIsSaturday] = useState(false);

  // Hook que inicializa o Firebase e o estado do usuário
  useEffect(() => {
    const initializeFirebase = async () => {
      try {
        // Usa a variável global do ambiente Canvas para a configuração do Firebase
        const firebaseConfig = JSON.parse(typeof __firebase_config !== 'undefined' ? __firebase_config : '{}');

        // Inicializa o app do Firebase
        const app = initializeApp(firebaseConfig);
        const authInstance = getAuth(app);
        const dbInstance = getFirestore(app);

        setDb(dbInstance);
        setAuth(authInstance);

        // Usa o token de autenticação do ambiente Canvas. Se não estiver disponível, faz o login anônimo.
        if (typeof __initial_auth_token !== 'undefined') {
          await signInWithCustomToken(authInstance, __initial_auth_token);
        } else {
          await signInAnonymously(authInstance);
        }

        const user = authInstance.currentUser;
        setUserId(user ? user.uid : `anon-${crypto.randomUUID()}`);
        setLoading(false);
      } catch (e) {
        console.error("Erro ao inicializar Firebase:", e);
        setMessage('Erro ao carregar o aplicativo. Verifique a configuração do Firebase.');
        setLoading(false);
      }
    };

    initializeFirebase();
  }, []);

  // Hook que monitora a data e carrega o plano de estudos da semana atual
  useEffect(() => {
    if (!userId || !db) return;

    const today = new Date();
    const dayOfWeek = today.getDay(); // 0 = Domingo, 6 = Sábado
    setIsSaturday(dayOfWeek === 6);

    const checkStudyPlan = async () => {
      setLoading(true);
      // Usamos a estrutura de coleção/documento para salvar o plano
      const studyPlanRef = doc(db, 'users', userId, 'studyPlans', `plan-${currentWeek}`);

      try {
        const docSnap = await getDoc(studyPlanRef);
        if (docSnap.exists()) {
          setStudyPlan(docSnap.data());
          // Se for sábado e o plano da semana não tiver um seminário, o app tenta gerar um.
          if (dayOfWeek === 6 && !docSnap.data().seminar) {
            generateSeminar();
          }
          setShowForm(false);
        } else {
          setShowForm(true);
        }
      } catch (e) {
        console.error("Erro ao carregar plano de estudo:", e);
        setMessage('Erro ao carregar o plano de estudo. Por favor, tente novamente.');
      }
      setLoading(false);
    };

    checkStudyPlan();
  }, [userId, db, currentWeek]);

  // Esta função gera o tema e os detalhes do seminário usando a API do Gemini
  const generateSeminar = async () => {
    if (studyPlan.completedDays.length < 6) {
      setMessage('A semana não foi concluída. Marque todos os dias como feitos para gerar o seminário.');
      return;
    }
    setLoading(true);
    setMessage('Gerando o tema detalhado do seu seminário semanal...');

    const difficultSubjects = Object.keys(studyPlan.difficulties)
      .filter(subject => studyPlan.difficulties[subject] >= 4)
      .join(', ');
    
    const prompt = `Você é um tutor de estudos para o ENEM. Um aluno do 2º ano do ensino médio tem dificuldades com as seguintes matérias: ${difficultSubjects}. Baseado nisso, sugira um tema detalhado para um "seminário de sábado" que foque em um desses tópicos. Forneça o plano do seminário como um objeto JSON. Inclua um título, um tópico principal, 2 a 3 sub-tópicos com uma breve descrição para cada, e uma analogia simples para ajudar na compreensão. Use dados abertos e amplamente disponíveis sobre o ENEM.`;

    const responseSchema = {
      type: "OBJECT",
      properties: {
        title: { "type": "STRING" },
        mainTopic: { "type": "STRING" },
        subTopics: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              name: { "type": "STRING" },
              description: { "type": "STRING" }
            }
          }
        },
        analogy: { "type": "STRING" }
      },
      "propertyOrdering": ["title", "mainTopic", "subTopics", "analogy"]
    };

    let retries = 0;
    const maxRetries = 5;
    const delay = (ms) => new Promise(res => setTimeout(res, ms));
    let newSeminar = null;
    
    while (retries < maxRetries) {
      try {
        const payload = {
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: responseSchema
          }
        };
        // Deixa a chave da API do Gemini vazia para que o Canvas a injete
        const apiKey = "";
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;

        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const result = await response.json();
        const jsonText = result?.candidates?.[0]?.content?.parts?.[0]?.text;
        newSeminar = JSON.parse(jsonText);
        
        break;
      } catch (error) {
        console.error(`Tentativa ${retries + 1} falhou. Erro na chamada da API:`, error);
        retries++;
        if (retries < maxRetries) {
          await delay(Math.pow(2, retries) * 1000);
        } else {
          setMessage('Erro ao gerar o tema do seminário. Verifique sua conexão e tente novamente.');
          setLoading(false);
          return;
        }
      }
    }

    try {
      const studyPlanRef = doc(db, 'users', userId, 'studyPlans', `plan-${currentWeek}`);
      await setDoc(studyPlanRef, { ...studyPlan, seminar: newSeminar }, { merge: true });

      setStudyPlan(prevPlan => ({
        ...prevPlan,
        seminar: newSeminar
      }));
      setLoading(false);
      setMessage('Seminário gerado com sucesso!');
    } catch (e) {
      console.error("Erro ao salvar plano de estudo:", e);
      setMessage('Erro ao salvar o seminário. Tente novamente.');
      setLoading(false);
    }
  };

  const handleDifficultyChange = (subject, difficulty) => {
    setSubjectDifficulties({
      ...subjectDifficulties,
      [subject]: difficulty
    });
  };

  const handleHoursChange = (e) => {
    setHoursPerDay(e.target.value);
  };

  const generatePlan = async () => {
    setLoading(true);
    setMessage('Gerando sua rotina de estudos detalhada...');

    const daysOfWeek = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

    const prompt = `Crie um plano de estudos semanal para o ENEM (de segunda a sábado) para um aluno do 2º ano do ensino médio. O aluno tem ${hoursPerDay} horas para estudar por dia. As dificuldades dele nas matérias (1-5, onde 5 é mais difícil) são: ${JSON.stringify(subjectDifficulties)}. O plano deve conter para cada dia: o dia da semana, uma ou duas matérias, e para cada matéria, um tópico principal e 2-3 sub-tópicos específicos. Além disso, inclua uma breve descrição ou objetivo para cada dia de estudo. Use dados abertos e amplamente disponíveis sobre o ENEM. A resposta deve ser um JSON válido no formato do schema abaixo.`;

    const responseSchema = {
      type: "OBJECT",
      properties: {
        weeklyPlan: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              day: { "type": "STRING" },
              schedule: {
                type: "ARRAY",
                items: {
                  type: "OBJECT",
                  properties: {
                    subject: { "type": "STRING" },
                    mainTopic: { "type": "STRING" },
                    subTopics: {
                      type: "ARRAY",
                      items: { "type": "STRING" }
                    },
                    description: { "type": "STRING" }
                  }
                }
              }
            },
            "propertyOrdering": ["day", "schedule"]
          }
        }
      }
    };
    
    let retries = 0;
    const maxRetries = 5;
    const delay = (ms) => new Promise(res => setTimeout(res, ms));
    let newPlan = {};
    let generationSucceeded = false;

    while (retries < maxRetries) {
      try {
        const payload = {
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: responseSchema
          }
        };
        // Deixa a chave da API do Gemini vazia para que o Canvas a injete
        const apiKey = "";
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;

        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const result = await response.json();
        const jsonText = result?.candidates?.[0]?.content?.parts?.[0]?.text;
        const parsedJson = JSON.parse(jsonText);
        
        newPlan = parsedJson.weeklyPlan.reduce((acc, dayPlan) => {
          acc[dayPlan.day] = dayPlan.schedule;
          return acc;
        }, {});
        
        generationSucceeded = true;
        break;
      } catch (error) {
        console.error(`Tentativa ${retries + 1} falhou. Erro na chamada da API:`, error);
        retries++;
        if (retries < maxRetries) {
          await delay(Math.pow(2, retries) * 1000);
        }
      }
    }

    if (!generationSucceeded) {
      newPlan = daysOfWeek.reduce((acc, day) => {
        const subjectsToStudy = Object.keys(subjectDifficulties).sort((a, b) => subjectDifficulties[b] - subjectDifficulties[a]);
        const subject = subjectsToStudy[Math.floor(Math.random() * subjectsToStudy.length)];
        const topic = sampleTopics[subject][Math.floor(Math.random() * sampleTopics[subject].length)];
        acc[day] = [{
          subject: subject,
          mainTopic: topic,
          subTopics: ["Sub-tópico 1", "Sub-tópico 2"],
          description: "Revisão geral do tema"
        }];
        return acc;
      }, {});
      setMessage('Erro ao gerar plano detalhado. Gerando um plano básico.');
    }
    
    const newStudyPlan = {
      hours: hoursPerDay,
      difficulties: subjectDifficulties,
      plan: newPlan,
      completedDays: [],
      week: currentWeek,
    };

    try {
      const studyPlanRef = doc(db, 'users', userId, 'studyPlans', `plan-${currentWeek}`);
      await setDoc(studyPlanRef, newStudyPlan);

      setStudyPlan(newStudyPlan);
      setShowForm(false);
      if (generationSucceeded) {
        setMessage('Plano de estudo gerado e salvo com sucesso!');
      }
    } catch (e) {
      console.error("Erro ao salvar plano de estudo:", e);
      setMessage('Erro ao salvar o plano de estudo. Tente novamente.');
      setStudyPlan(newStudyPlan);
      setShowForm(false);
    }
    setLoading(false);
  };

  const markAsDone = async (day) => {
    const updatedCompletedDays = [...studyPlan.completedDays, day];
    const updatedPlan = { ...studyPlan, completedDays: updatedCompletedDays };

    try {
      const studyPlanRef = doc(db, 'users', userId, 'studyPlans', `plan-${currentWeek}`);
      await setDoc(studyPlanRef, updatedPlan, { merge: true });

      setStudyPlan(updatedPlan);
      setMessage(`${day} marcado como concluído!`);
    } catch (e) {
        console.error("Erro ao atualizar o plano:", e);
        setMessage('Erro ao marcar como concluído. Tente novamente.');
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
          <h2 className="text-3xl font-bold mb-4 text-indigo-700">Seminário da Semana!</h2>
          <div className="flex flex-col space-y-4 mb-6 text-left">
            <h3 className="text-2xl font-bold text-gray-800">{seminar.title}</h3>
            <p className="text-md font-semibold text-indigo-600">{seminar.mainTopic}</p>
            <ul className="list-disc list-inside text-gray-600 text-sm space-y-2">
              {seminar.subTopics?.map((sub, subIndex) => (
                <li key={subIndex}>
                  <span className="font-semibold">{sub.name}:</span> {sub.description}
                </li>
              ))}
            </ul>
            <p className="text-sm text-gray-700 italic mt-4">
              <span className="font-semibold">Analogia:</span> {seminar.analogy}
            </p>
          </div>
          <button
            onClick={() => {
              setStudyPlan({ ...studyPlan, seminar: null, completedDays: [] });
              setShowForm(true);
            }}
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
          <h2 className="text-2xl font-bold mb-6 text-indigo-800">Crie seu Plano de Estudos</h2>
          <p className="text-gray-600 mb-4">
            Total de semanas até o ENEM 2025: <span className="font-semibold">{calculateWeeksUntilENEM()}</span>
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
              onChange={handleHoursChange}
              className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="mb-6">
            <h3 className="text-lg font-medium text-gray-700 mb-2">Sua Dificuldade por Matéria (1-5)</h3>
            {subjects.map(subject => (
              <div key={subject} className="mb-4">
                <label className="block text-gray-600">{subject}</label>
                <div className="flex items-center space-x-2">
                  <input
                    type="range"
                    min="1"
                    max="5"
                    value={subjectDifficulties[subject]}
                    onChange={(e) => handleDifficultyChange(subject, parseInt(e.target.value))}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer range-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <span className="text-gray-700 font-semibold">{subjectDifficulties[subject]}</span>
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
      const daysOfWeek = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
      return (
        <div className="p-8 bg-white rounded-lg shadow-xl">
          <h2 className="text-2xl font-bold mb-6 text-indigo-800">Sua Rotina Semanal Detalhada</h2>
          <p className="text-gray-600 mb-4">
            ID do Usuário: <span className="font-mono text-xs">{userId}</span>
          </p>
          <div className="grid md:grid-cols-2 gap-6">
            {daysOfWeek.map(day => (
              <div key={day} className="bg-gray-50 p-6 rounded-lg border border-gray-200 shadow-sm">
                <h3 className="text-lg font-bold text-gray-800 mb-2">{day}</h3>
                <p className="text-sm text-gray-500 mb-4">
                  {studyPlan.hours} hora(s) de estudo
                </p>
                {studyPlan.plan[day]?.map((item, index) => (
                  <div key={index} className="flex flex-col space-y-1 mb-4 border-l-4 border-indigo-400 pl-4">
                    <p className="text-md font-semibold text-indigo-600">{item.subject}: {item.mainTopic}</p>
                    <p className="text-sm text-gray-700 italic">{item.description}</p>
                    <ul className="list-disc list-inside text-gray-600 text-sm">
                      {item.subTopics?.map((sub, subIndex) => (
                        <li key={subIndex}>{sub}</li>
                      ))}
                    </ul>
                  </div>
                ))}
                <button
                  onClick={() => markAsDone(day)}
                  disabled={studyPlan.completedDays.includes(day)}
                  className={`mt-4 w-full py-2 rounded-lg font-semibold transition duration-300 ${
                    studyPlan.completedDays.includes(day)
                      ? 'bg-green-500 text-white cursor-not-allowed'
                      : 'bg-indigo-500 text-white hover:bg-indigo-600'
                  }`}
                >
                  {studyPlan.completedDays.includes(day) ? 'Concluído!' : 'Marcar como Concluído'}
                </button>
              </div>
            ))}
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
            Organize sua rotina, acompanhe seu progresso e conquiste a aprovação!
          </p>
          <p className="text-sm text-gray-500 mt-2">
            ID do usuário: <span className="font-mono">{userId}</span>
          </p>
        </header>

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
