import './home.css';
import { useState } from 'react';
import {
  IoCheckmark,
  IoCopyOutline,
  IoFlashSharp,
  IoServerSharp,
  IoShieldCheckmarkSharp,
  IoGitMergeSharp,
  IoCloudUploadSharp,
  IoSpeedometerSharp,
  IoListSharp,
  IoBugSharp,
  IoLayersSharp,
  IoCodeSlash,
  IoCheckmarkDone,
  IoTerminal,
  IoPhonePortrait,
  IoBook,
  IoLogoGithub,
} from 'react-icons/io5';
import { FaWhatsapp, FaNpm } from 'react-icons/fa';
import { MdSpeed } from 'react-icons/md';
import { PiWavesBold } from 'react-icons/pi';
import {
  installCode,
  actionCode,
  serviceCode,
  serverCode,
  invokeCode,
  installRaw,
  actionRaw,
  serviceRaw,
  serverRaw,
  invokeRaw,
} from '../home-code-blocks';

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

export default function Home() {
  return (
    <div className="dialogue-home">
      {/* Top Spotlight Background */}
      <div
        className="spotlight-bg"
        style={{
          background: `
            radial-gradient(
              circle at top,
              rgba(255, 255, 255, 0.08) 0%,
              rgba(255, 255, 255, 0.08) 20%,
              rgba(0, 0, 0, 0.0) 60%
            )
          `,
        }}
      />
      <section className="hero">
        <div className="hero-content">
          <h1 className="hero-title">
            <span className="hero-icon">
              <PiWavesBold />
            </span>
            <span className="highlight">Nile Js</span>
          </h1>
          <p className="hero-tagline">
            TypeScript-first, service and actions oriented backend framework for
            building modern, fast, safe and AI-ready backends with simplest
            developer experience possible.
          </p>
          <p className="hero-description">
            You define actions, group them into services, and get a predictable
            API with validation, error handling, and schema export, no route
            definitions, no controllers, no middleware chains and rest api
            conventions to care about, just your business logic.
            <br/><br/>
            And it's all AI
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
        <h2>Installation</h2>
        <div className="code-wrapper">
          <div
            className="code-block"
            dangerouslySetInnerHTML={{ __html: installCode }}
          />
          <CopyButton code={installRaw} />
        </div>
      </section>

      <section className="quick-start">
        <h2>How It Works</h2>
        <div className="code-grid">
          <div className="code-column">
            <h3>1. Define an Action</h3>
            <div className="code-wrapper">
              <div
                className="code-block"
                dangerouslySetInnerHTML={{ __html: actionCode }}
              />
              <CopyButton code={actionRaw} />
            </div>
          </div>
          <div className="code-column">
            <h3>2. Group into a Service</h3>
            <div className="code-wrapper">
              <div
                className="code-block"
                dangerouslySetInnerHTML={{ __html: serviceCode }}
              />
              <CopyButton code={serviceRaw} />
            </div>
          </div>
        </div>
        <div className="code-grid" style={{ marginTop: '1rem' }}>
          <div className="code-column">
            <h3>3. Start the Server</h3>
            <div className="code-wrapper">
              <div
                className="code-block"
                dangerouslySetInnerHTML={{ __html: serverCode }}
              />
              <CopyButton code={serverRaw} />
            </div>
          </div>
          <div className="code-column">
            <h3>4. Invoke the Action</h3>
            <div className="code-wrapper">
              <div
                className="code-block"
                dangerouslySetInnerHTML={{ __html: invokeCode }}
              />
              <CopyButton code={invokeRaw} />
            </div>
          </div>
        </div>
      </section>

      <section className="features why-care">
        <h2 className="features-title">Why You Should Care</h2>
        <div className="features-grid">
          <div className="feature feature-large">
            <div className="feature-icon">
              <IoFlashSharp />
            </div>
            <h3>Service-Action Model</h3>
            <p>
              Define operations as actions, group them into services by domain.
              No route definitions, no controllers, no middleware chains. Just
              business logic with a consistent interface.
            </p>
          </div>
          <div className="feature">
            <div className="feature-icon">
              <IoSpeedometerSharp />
            </div>
            <h3>Built for Speed</h3>
            <p>
              Highly optimized with first-class Bun support. A single endpoint
              with fast action lookups and caching for frequently accessed
              operations. Deploys anywhere Node.js or Bun can run.
            </p>
          </div>
          <div className="feature feature-tall">
            <div className="feature-icon">
              <MdSpeed />
            </div>
            <h3>AI Agent Ready</h3>
            <p>
              Every action exports its schema as JSON Schema. AI agents can
              discover available operations, understand their parameters, and
              invoke them through the same endpoint your frontend uses.
            </p>
          </div>
          <div className="feature">
            <div className="feature-icon">
              <IoShieldCheckmarkSharp />
            </div>
            <h3>Result Pattern</h3>
            <p>
              Every handler returns Ok or Err. No unhandled exceptions. Every
              response follows the same shape: status, message, and data.
            </p>
          </div>
          <div className="feature">
            <div className="feature-icon">
              <IoGitMergeSharp />
            </div>
            <h3>Composable Pipelines</h3>
            <p>
              Chain actions together with hooks. Before hooks validate or gate.
              After hooks log or notify. Critical hooks stop the pipeline on
              failure, non-critical ones log and continue.
            </p>
          </div>
        </div>
        <div className="features-grid">
          <div className="feature">
            <div className="feature-icon">
              <IoLayersSharp />
            </div>
            <h3>Built-In Auth</h3>
            <p>
              JWT authentication configured once at the server level, enforced
              per action. Global hooks handle authorization, RBAC, and API keys
              without per-route middleware.
            </p>
          </div>
          <div className="feature feature-large">
            <div className="feature-icon">
              <IoCloudUploadSharp />
            </div>
            <h3>First-Class File Uploads</h3>
            <p>
              Multipart form-data support with MIME detection, file size limits,
              and extension validation. No external libraries needed.
            </p>
          </div>
          <div className="feature">
            <div className="feature-icon">
              <IoListSharp />
            </div>
            <h3>Structured Logging</h3>
            <p>
              Built-in logger with chunking support. Every request, hook
              execution, and error is logged with context for debugging.
            </p>
          </div>
          <div className="feature feature-large">
            <div className="feature-icon">
              <IoBugSharp />
            </div>
            <h3>Robust Error Handling</h3>
            <p>
              Every handler and hook is wrapped in error handling. Crashes become
              graceful failures. Traceable log IDs make production debugging
              straightforward.
            </p>
          </div>
          <div className="feature feature-large">
            <div className="feature-icon">
              <IoCodeSlash />
            </div>
            <h3>Type Safety</h3>
            <p>
              Payload types are preserved through generics. The schema intent
              serves types over the wire for client code generation without
              monorepo coupling.
            </p>
          </div>
          <div className="feature">
            <div className="feature-icon">
              <IoCheckmarkDone />
            </div>
            <h3>Predictable and Simple</h3>
            <p>
              One endpoint. One request shape. One response shape. Every action
              follows the same pattern. Low mental overhead means less context
              switching and fewer decisions about how to structure code.
            </p>
          </div>
        </div>
      </section>

      <section className="features ecosystem">
        <h2 className="features-title">Ecosystem</h2>
        <div className="features-grid">
          <a
            className="feature community-link"
            href="https://chat.whatsapp.com/K0xkSiilbVtFf3QZoA1z5Z?mode=gi_t"
            rel="noopener noreferrer"
            target="_blank">
            <div className="feature-icon">
              <FaWhatsapp />
            </div>
            <h3>WhatsApp</h3>
            <p>Join the community chat for discussions, help, and updates.</p>
          </a>
          <a
            className="feature community-link"
            href="https://context7.com/nile-js/nile"
            rel="noopener noreferrer"
            target="_blank">
            <div className="feature-icon">
              <IoBook />
            </div>
            <h3>Context7 MCP</h3>
            <p>Full documentation available for AI assistants and agents.</p>
          </a>
          <a
            className="feature community-link"
            href="https://www.npmjs.com/package/@nilejs/cli"
            rel="noopener noreferrer"
            target="_blank">
            <div className="feature-icon">
              <FaNpm />
            </div>
            <h3>CLI on npm</h3>
            <p>Scaffold projects and generate code with the Nile CLI.</p>
          </a>
          <a
            className="feature community-link"
            href="https://www.npmjs.com/package/@nilejs/client"
            rel="noopener noreferrer"
            target="_blank">
            <div className="feature-icon">
              <FaNpm />
            </div>
            <h3>Client on npm</h3>
            <p>Typed client package for any JavaScript environment.</p>
          </a>
          <a
            className="feature feature-large community-link"
            href="https://github.com/nile-js/nile"
            rel="noopener noreferrer"
            target="_blank">
            <div className="feature-icon">
              <IoLogoGithub />
            </div>
            <h3>GitHub</h3>
            <p>View the source, report issues, and contribute to the framework.</p>
          </a>
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
}