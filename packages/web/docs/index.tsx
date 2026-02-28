import './home.css';
import { useState } from 'react';
import {
  IoCheckmark,
  IoCopyOutline,
  IoFlashSharp,
  IoServerSharp,
  IoShieldCheckmarkSharp,
} from 'react-icons/io5';
import { MdSpeed } from 'react-icons/md';
import { codeToHtml } from 'shiki';
import { PiWavesBold } from 'react-icons/pi';

const BASE_PATH = '/nile';
const withBase = (path: string) => `${BASE_PATH}${path}`;

export const frontmatter = {
  pageType: 'custom',
};

const CopyButton = ({ code }: { code: string }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button className="copy-button" onClick={handleCopy} type="button">
      {copied ? <IoCheckmark /> : <IoCopyOutline />}
    </button>
  );
};

export const Home = async () => {
  const bunInstallRaw = 'npx @nilejs/cli new my-app';
  const bunInstallCode = await codeToHtml(bunInstallRaw, {
    lang: 'bash',
    theme: 'material-theme-ocean',
  });

  const serverCodeRaw = `// tasks/create.ts
import { Ok } from "slang-ts";
import z from "zod";
import { createAction, type Action } from "@nilejs/nile";

const createTaskSchema = z.object({
  title: z.string().min(1, "Title is required"),
  status: z.enum(["pending", "in-progress", "done"]).default("pending"),
});

const createTaskHandler = (data: Record<string, unknown>) => {
  const task = { id: crypto.randomUUID(), ...data };
  return Ok({ task });
};

export const createTaskAction: Action = createAction({
  name: "create",
  description: "Create a new task",
  handler: createTaskHandler,
  validation: createTaskSchema,
});`;

  const serverCode = await codeToHtml(serverCodeRaw, {
    lang: 'typescript',
    theme: 'material-theme-ocean',
  });

  const clientCodeRaw = `# Invoke the action via POST
curl -X POST http://localhost:8000/api/services \\
  -H "Content-Type: application/json" \\
  -d '{
    "intent": "execute",
    "service": "tasks",
    "action": "create",
    "payload": { "title": "Ship Nile", "status": "in-progress" }
  }'`;

  const clientCode = await codeToHtml(clientCodeRaw, {
    lang: 'bash',
    theme: 'material-theme-ocean',
  });

  return (
    <div className="dialogue-home">
      <section className="hero">
        <div className="hero-content">
          <h1 className="hero-title">
            <span className="hero-icon">
              <PiWavesBold />
            </span>
            <span className="highlight">Nile</span>
          </h1>
          <p className="hero-tagline">
            TypeScript-first, service and actions oriented backend framework for
            building modern, fast, safe and AI-ready backends with simplest
            developer experience possible.
            <br />
            You define actions, group them into services, and get a predictable
            API with validation, error handling, and schema export, no route
            definitions, no controllers, no middleware chains and rest api
            conventions to care about, just your business logic. And it's all AI
            agent-ready out of the box, progressively discoverable and tool
            calling ready with validation.
          </p>
          <div className="hero-actions">
            <a
              className="btn btn-primary"
              href={withBase('/guide/start/getting-started')}>
              Get Started
            </a>
            <a
              className="btn btn-secondary"
              href="https://github.com/nile-js/nile"
              rel="noopener noreferrer"
              target="_blank">
              View on GitHub
            </a>
          </div>
        </div>
      </section>

      <section className="installation">
        <h2>Quick Start</h2>
        <div className="code-wrapper">
          <div
            className="code-block"
            // biome-ignore lint/security/noDangerouslySetInnerHtml: Shiki-generated HTML from trusted static code
            dangerouslySetInnerHTML={{ __html: bunInstallCode }}
          />
          <CopyButton code={bunInstallRaw} />
        </div>
        <p className="install-alt">
          or with bunx: <code>bunx @nilejs/cli new my-app</code>
        </p>
      </section>

      <section className="quick-start">
        <h2>How It Works</h2>
        <div className="code-grid">
          <div className="code-column">
            <h3>Define Your Action</h3>
            <div className="code-wrapper">
              <div
                className="code-block"
                // biome-ignore lint/security/noDangerouslySetInnerHtml: Shiki-generated HTML from trusted static code
                dangerouslySetInnerHTML={{ __html: serverCode }}
              />
              <CopyButton code={serverCodeRaw} />
            </div>
          </div>
          <div className="code-column">
            <h3>Invoke It</h3>
            <div className="code-wrapper">
              <div
                className="code-block"
                // biome-ignore lint/security/noDangerouslySetInnerHtml: Shiki-generated HTML from trusted static code
                dangerouslySetInnerHTML={{ __html: clientCode }}
              />
              <CopyButton code={clientCodeRaw} />
            </div>
          </div>
        </div>
      </section>

      <section className="features">
        <h2 className="features-title">Why Nile?</h2>
        <div className="features-grid">
          <div className="feature feature-large">
            <div className="feature-icon">
              <IoFlashSharp />
            </div>
            <h3>Pure Developer Ergonomics</h3>
            <p>
              Stop debating HTTP verbs and routing controllers. Define your
              domain, write simple actions, and Nile handles the rest. The path
              of least resistance for shipping features.
            </p>
          </div>
          <div className="feature">
            <div className="feature-icon">
              <IoShieldCheckmarkSharp />
            </div>
            <h3>Functional Safety</h3>
            <p>
              Say goodbye to unhandled exceptions crashing your server. Nile
              enforces a strict Result pattern—your control flow becomes
              infinitely predictable.
            </p>
          </div>
          <div className="feature feature-tall">
            <div className="feature-icon">
              <MdSpeed />
            </div>
            <h3>Native AI Agent Integration</h3>
            <p>
              LLMs understand JSON Schemas, not REST semantics. Every Nile
              action exports its exact parameters out-of-the-box—your API is
              instantly ready for AI tool-calling.
            </p>
          </div>
          <div className="feature feature-large">
            <div className="feature-icon">
              <IoServerSharp />
            </div>
            <h3>Type Safety Without Boundaries</h3>
            <p>
              Get full-stack type inference without coupling frontend and
              backend in a monorepo. Nile dynamically serves schemas over the
              wire for any language, anywhere.
            </p>
          </div>
        </div>
      </section>

      <section className="use-cases">
        <h2>Built For</h2>
        <div className="use-cases-grid">
          <div className="use-case">
            <h3>Fast-Moving Teams</h3>
            <p>
              Focus on business logic, not framework fighting. Nile gets out of
              your way so you can ship features at the speed of thought.
            </p>
          </div>
          <div className="use-case">
            <h3>AI Agent Backends</h3>
            <p>
              Build services that AI agents can discover and consume natively.
              Perfect for tool-calling, autonomous workflows, and LLM
              integrations.
            </p>
          </div>
          <div className="use-case">
            <h3>Enterprise Services</h3>
            <p>
              The strict Result pattern and hooks system make Nile ideal for
              complex business logic where predictability matters more than HTTP
              purity.
            </p>
          </div>
          <div className="use-case">
            <h3>Modern Stacks</h3>
            <p>
              Built on Hono. Works with Bun, Node.js, and Deno. Type-safe from
              end to end with Zod and TypeScript.
            </p>
          </div>
        </div>
      </section>

      <footer className="home-footer">
        <p>
          Built with love by{' '}
          <a
            href="https://github.com/Hussseinkizz"
            rel="noopener noreferrer"
            target="_blank">
            Hussein Kizz
          </a>
        </p>
      </footer>
    </div>
  );
};

export default Home;
