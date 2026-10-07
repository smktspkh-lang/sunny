import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

app.use(express.json());

// Initialize server-side Gemini client
const apiKey = process.env.GEMINI_API_KEY;
const ai = apiKey
  ? new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    })
  : null;

// Health endpoint
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    geminiConfigured: !!ai,
    timestamp: new Date().toISOString(),
  });
});

// Dedicated AI Career Coach API
app.post('/api/ai-coach', async (req, res) => {
  try {
    const { message, studentContext, history = [] } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    if (!ai) {
      // Graceful smart fallback response when GEMINI_API_KEY is not configured
      const fallbackReply = generateFallbackCoachReply(message, studentContext);
      return res.json({ reply: fallbackReply, source: 'coach-knowledge-base' });
    }

    const systemPrompt = `You are SkillBridge AI, the student career coach for Indian engineering and CS/IT students (B.Tech, BCA, MCA, B.Sc CS). Your job is to help the student improve employability with realistic, high-impact, practical guidance.

Student profile:
- Name: ${studentContext?.name || 'Student'}
- College: ${studentContext?.college || 'Tier-2/3 Indian Engineering College'}
- Degree & Year: ${studentContext?.degree || 'B.Tech'} ${studentContext?.branch || 'CSE'}, Year ${studentContext?.year || '3rd Year'}
- Target Career Role: ${studentContext?.targetRole || 'Frontend Developer'}
- Current Career Readiness: ${studentContext?.readinessScore || 43}%
- Current 90-Day Roadmap Phase: Week ${studentContext?.currentWeek || 3} of 12
- Key Skill Gaps: ${studentContext?.skillGaps?.join(', ') || 'React, State Management, Git, Testing'}
- Strengths: ${studentContext?.strengths?.join(', ') || 'HTML, CSS, Basic JavaScript'}
- Recommended Next Project: ${studentContext?.nextProject || 'Student Expense Tracker'}

Mission:
- Help the student answer: "What should I do next to become job-ready?"
- Prioritize the highest-leverage action within the next 24-72 hours.
- Make recommendations specific to Indian hiring patterns, including resumes, projects, DSA, communication, and interview screens.

Behavior rules:
1. Be direct, encouraging, and realistic. Avoid motivational fluff and buzzwords.
2. Always ground advice in the student's actual profile, weak areas, and timeline.
3. Prefer actionable steps over theory. Give precise tasks, examples, and 7-14 day execution plans.
4. When the user asks vague questions, narrow the answer to the most probable opportunity gap and ask 1 clarifying question only if necessary.
5. For technical topics, recommend concrete concepts and problem types, such as React hooks, async JS, arrays/strings/hash maps, backend basics, or project architecture patterns.
6. For placement guidance, include practical checkpoints: project quality, GitHub, resume quality, DSA preparation, mock interview readiness, and communication skills.
7. If the student is behind schedule, suggest a recovery plan rather than generic encouragement.
8. Avoid claiming guaranteed outcomes; use realistic probabilities and growth-oriented advice.
9. Keep answers structured, scannable, and concise. Best format: "Priority action", "Why it matters", "What to do this week", "What to avoid".
10. If the user asks for code, give short working examples only when relevant to the concept. Otherwise, keep the answer focused on career strategy and execution.

Response style:
- Use bullet points, numbered steps, and simple headings.
- Start with the most important action for today.
- Include a realistic timeline and next milestone.
- Keep language clear for a college student, not a recruiter or senior engineer.
- Keep the answer tailored to the target role and current readiness score.`;

    const chatContents: Array<{ role: string; parts: Array<{ text: string }> }> = [
      { role: 'user', parts: [{ text: systemPrompt }] },
      { role: 'model', parts: [{ text: "Understood! I'm fully primed with this student's profile, skill gaps, 90-day placement roadmap, and Indian tech recruitment requirements. How can I guide them today?" }] },
    ];

    // Include recent history
    if (Array.isArray(history)) {
      for (const h of history.slice(-4)) {
        if (h.sender === 'user') {
          chatContents.push({ role: 'user', parts: [{ text: h.text }] });
        } else if (h.sender === 'ai') {
          chatContents.push({ role: 'model', parts: [{ text: h.text }] });
        }
      }
    }

    chatContents.push({ role: 'user', parts: [{ text: message }] });

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: chatContents,
    });

    const reply = response.text || "Let's review your 90-day roadmap and focus on the highest-priority skill gap first.";
    return res.json({ reply, source: 'gemini-3.8-flash' });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    console.error('Error in AI Coach API:', errorMsg);
    // Provide a resilient contextual response rather than breaking user experience
    const fallbackReply = generateFallbackCoachReply(req.body?.message || '', req.body?.studentContext);
    return res.json({ reply: fallbackReply, source: 'fallback-on-error', note: errorMsg });
  }
});

function generateFallbackCoachReply(query: string, ctx: any): string {
  const q = query.toLowerCase();
  const role = ctx?.targetRole || 'Frontend Developer';
  const name = ctx?.name || 'Sunny';

  if (q.includes('today') || q.includes('next') || q.includes('learn today')) {
    return `### 🎯 Your Focused Plan for Today (${role})

Hey ${name}! Looking at your **Week 3 Milestone**, here is your high-impact 3-hour action block:

1. **Core Concept (45 mins)**: Master JavaScript Async/Await vs Promises with a practical example (fetching user repository data from GitHub API).
2. **Coding Drill (45 mins)**: Implement a custom debounce hook or function from scratch—this is asked in 70% of frontend screening rounds!
3. **Project Milestone (60 mins)**: In your **"${ctx?.nextProject || 'Student Expense Tracker'}"**, create the state reducer for category-wise budgeting.
4. **Git Discipline (15 mins)**: Make a clean commit with conventional commit message: \`feat(tracker): add expense breakdown component\`.

*Consistency tip: Complete this and your learning streak will advance to ${(ctx?.streakDays || 12) + 1} days!*`;
  }

  if (q.includes('react') || q.includes('skill gap') || q.includes('gap')) {
    return `### ⚡ Why React is your highest leverage gap right now

In the Indian fresher/intern market, recruiters filter candidates instantly if they only know HTML/CSS but struggle to explain:
- Component lifecycle & \`useEffect\` dependency arrays
- Clean state lifting vs Context API / Zustand
- Custom hooks reusability
- Optimistic UI updates

**How to close this gap in 14 days:**
- Build 3 isolated mini-apps instead of copying a tutorial:
  1. Multi-filter product catalog (search + sort + tags)
  2. Tabbed modal with keyboard accessibility
  3. Real-time form with Zod validation
- Your readiness score will jump from **${ctx?.readinessScore || 43}% to ~62%** once you master component state patterns!`;
  }

  if (q.includes('project') || q.includes('build')) {
    return `### 🛠️ High-Yield Project Recommendation for ${role}

Stop building generic Todo apps or Netflix clones—recruiters ignore them! Instead build:

**Recommended Project: "${ctx?.nextProject || 'Campus Placement Analytics & Expense Portal'}"**
- **Tech Stack**: React 19, TypeScript, Tailwind CSS, LocalStorage / IndexedDB, Chart.js/Recharts.
- **Why It Stands Out**:
  - Solves a real student problem (tracking college budgets & placement applications).
  - Demonstrates complex state management (filtering 50+ companies, salary filters).
  - Export feature: Generates PDF/CSV reports (shows business software capability).
- **Time to complete**: ~12 hours across 4 focused weekend sessions.`;
  }

  if (q.includes('interview') || q.includes('ready') || q.includes('placement')) {
    return `### 💼 Placement Readiness Assessment for ${role}

Your current readiness score is **${ctx?.readinessScore || 43}%**. Here is the realistic breakdown:

- **What you have going for you**: Strong foundational syntax and good consistency (${ctx?.streakDays || 12}-day streak).
- **What is holding you back from clearing round 1**:
  - Need 1 solid production-grade project on GitHub with a live Vercel/Netlify URL and README architectural diagram.
  - Need 25 solved array/string/hashmap problems on LeetCode / GeeksForGeeks.
- **Timeline**: At 10-15 hours/week, you will be **Round-1 Ready by Week 8** and **Offer-Ready by Week 12** of your 90-day roadmap.`;
  }

  return `### 🚀 SkillBridge AI Mentorship Advice

For ${role} in college placements:
- **Priority 1**: Bridge your top skill gap (**${ctx?.skillGaps?.[0] || 'React & Modern JavaScript'}**).
- **Priority 2**: Commit at least 1 meaningful PR or commit to your GitHub profile daily.
- **Priority 3**: Review the weekly milestone checklist in your **90-Day Roadmap** tab.

Feel free to ask me about coding questions, resume formatting, mock interview scenarios, or debugging your current project!`;
}

// Setup Vite middleware in dev or static serve in production
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SkillBridge AI server running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
