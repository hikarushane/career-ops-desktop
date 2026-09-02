import { useCallback, useEffect, useRef, useState } from 'react';
import {
  previewIntakeProposal,
  applyIntakeProposal,
  confirmIntakeProposal,
} from '../lib/runner';

type Props = {
  root: string;
  onComplete: () => void;
};

const PROFILE_FILES = ['cv.md', 'config/profile.yml', 'modes/_profile.md'];

export default function ProfileGeneration({ root, onComplete }: Props) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(true);
  const started = useRef(false);

  const generate = useCallback(async () => {
    setGenerating(true);
    setError(null);
    setActiveIndex(0);

    const timer = setInterval(() => {
      setActiveIndex((i) => (i + 1) % PROFILE_FILES.length);
    }, 2400);

    try {
      const session = await previewIntakeProposal(root);

      if (session.proposal.items.length === 0) {
        clearInterval(timer);
        setActiveIndex(PROFILE_FILES.length);
        setGenerating(false);
        setTimeout(onComplete, 500);
        return;
      }

      const allIds = session.proposal.items.map((item) => item.id);
      await applyIntakeProposal(root, session.intakeSessionId, allIds);
      await confirmIntakeProposal(session.intakeSessionId);

      clearInterval(timer);
      setActiveIndex(PROFILE_FILES.length);
      setGenerating(false);
      setTimeout(onComplete, 500);
    } catch (reason) {
      clearInterval(timer);
      setGenerating(false);
      setError(
        reason instanceof Error ? reason.message
          : typeof reason === 'string' ? reason
          : 'Profile generation failed.',
      );
    }
  }, [root, onComplete]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void generate();
  }, [generate]);

  const isRunning = generating;

  return (
    <div className="setup-screen">
      <h1>
        {isRunning
          ? <span className="animated-dots">Generating your profile</span>
          : error
          ? 'Generation failed'
          : 'Profile generated'}
      </h1>
      <p className="setup-subtitle">
        {isRunning
          ? 'AI is reading your imported documents and building your career profile.'
          : error
          ? 'Something went wrong. You can try again or skip this step.'
          : 'Your profile files have been created.'}
      </p>

      <div className="profile-gen-steps">
        {PROFILE_FILES.map((file, i) => (
          <div
            key={file}
            className={`agent-step ${i < activeIndex ? 'done' : i === activeIndex && isRunning ? 'active' : ''}`}
          >
            <span className="agent-step-dot" />
            <span className={i === activeIndex && isRunning ? 'animated-dots' : undefined}>
              {file}
            </span>
          </div>
        ))}
      </div>

      {error && (
        <>
          <p className="intake-error" role="alert">{error}</p>
          <div className="setup-actions">
            <button className="btn-primary" onClick={() => { started.current = false; void generate(); }}>
              Try again
            </button>
            <button className="btn-ghost" onClick={onComplete}>
              Skip for now
            </button>
          </div>
        </>
      )}
    </div>
  );
}
