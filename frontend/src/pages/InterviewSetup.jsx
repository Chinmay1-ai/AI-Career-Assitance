import { useAuth } from '@clerk/react';
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import InterviewIcon from '../components/InterviewIcon.jsx';
import InterviewMediaPreview from '../components/InterviewMediaPreview.jsx';
import { resolveTechnologySelection } from '../lib/interviewSetup.js';
import { getMessage, requestInterviewApi } from '../lib/interviews.js';
import { isClerkConfigured } from '../providers/ClerkAuthProvider.jsx';

function matchTechnology(skills, technologies) {
  const normalizedSkills = skills.map((skill) => skill.trim().toLocaleLowerCase());
  const aliases = {
    'c++': ['c++', 'cpp'],
    'html & css': ['html & css', 'html', 'css', 'html/css'],
    'javascript': ['javascript', 'js'],
    'node.js': ['node.js', 'nodejs', 'node'],
    'mongodb': ['mongodb', 'mongo'],
    'spring boot': ['spring boot', 'springboot'],
  };
  return technologies.find((technology) => {
    const choices = aliases[technology.toLocaleLowerCase()] ?? [technology.toLocaleLowerCase()];
    return normalizedSkills.some((skill) =>
      choices.some((choice) => skill === choice || skill.includes(choice)),
    );
  }) ?? '';
}

export default function InterviewSetup() {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [options, setOptions] = useState(null);
  const [selectedRole, setSelectedRole] = useState(searchParams.get('role') ?? '');
  const [technology, setTechnology] = useState('');
  const [customTechnology, setCustomTechnology] = useState('');
  const [difficulty, setDifficulty] = useState('INTERMEDIATE');
  const [questionCount, setQuestionCount] = useState(5);
  const [questionMode, setQuestionMode] = useState('AI');
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return undefined;
    let active = true;
    requestInterviewApi('/api/interviews/options', getToken)
      .then((data) => {
        if (!active) return;
        setOptions(data);
        setQuestionCount(data.defaultQuestionCount);
        setDifficulty((current) =>
          data.difficulties.includes(current) ? current : data.difficulties[0] ?? '',
        );
        const suggestedTechnology = searchParams.get('technology');
        const skills = [
          ...(suggestedTechnology ? [suggestedTechnology] : []),
          ...searchParams.getAll('skill'),
        ];
        const selectedTechnology = suggestedTechnology
          ? data.technologies.find(
            (item) => item.toLocaleLowerCase() === suggestedTechnology.trim().toLocaleLowerCase(),
          ) ?? matchTechnology(skills, data.technologies)
          : matchTechnology(skills, data.technologies);
        if (selectedTechnology) {
          setTechnology(selectedTechnology);
          setCustomTechnology('');
        } else if (suggestedTechnology) {
          setTechnology('');
          setCustomTechnology(suggestedTechnology);
        }
      })
      .catch((loadError) => {
        if (active) setError(getMessage(loadError, 'Could not load interview options.'));
      })
      .finally(() => {
        if (active) setLoadingOptions(false);
      });
    return () => {
      active = false;
    };
  }, [getToken, isLoaded, isSignedIn, searchParams]);

  async function startInterview(event) {
    event.preventDefault();
    setError('');
    const technologySelection = resolveTechnologySelection({
      popularTechnology: technology,
      customTechnology,
      technologies: options.technologies,
    });
    if (technologySelection.error) {
      setError(technologySelection.error);
      return;
    }

    setCreating(true);
    try {
      const { session } = await requestInterviewApi('/api/interviews', getToken, {
        method: 'POST',
        body: JSON.stringify({
          selectedRole,
          technology: technologySelection.value,
          difficulty,
          questionCount: Number(questionCount),
          questionMode,
          ...(searchParams.get('resumeId')
            ? { resumeId: searchParams.get('resumeId') }
            : {}),
        }),
      });
      navigate(`/interviews/${encodeURIComponent(session.id)}`);
    } catch (createError) {
      setError(getMessage(createError, 'Could not create the interview.'));
    } finally {
      setCreating(false);
    }
  }

  return (
    <section className="interview-page interview-setup-page">
      <header className="setup-hero">
        <p className="eyebrow"><InterviewIcon name="spark" size={15} /> PREPARE YOUR INTERVIEW</p>
        <h1>Build your interview session</h1>
        <p className="lead">
        Choose a role, technology, and difficulty. AI questions use your selected resume context when available; technologies with a local question bank can fall back if Gemini is unavailable.
        </p>
      </header>

      {!isClerkConfigured() ? (
        <p className="setup-hint" role="status">
          Configure Clerk in the new project to create an authenticated interview session.
        </p>
      ) : !isLoaded ? (
        <p role="status">Checking sign-in…</p>
      ) : !isSignedIn ? (
        <p className="error-text" role="alert">Sign in to create a mock interview.</p>
      ) : loadingOptions ? (
        <p role="status">Loading interview options…</p>
      ) : !options ? (
        <p className="error-text" role="alert">{error || 'Interview setup is unavailable.'}</p>
      ) : (
        <div className="interview-setup-grid">
          <form className="card interview-form" onSubmit={startInterview}>
            <label className="setup-field-label" htmlFor="interview-role"><InterviewIcon name="briefcase" size={16} /> Role</label>
            <input
              id="interview-role"
              list="interview-role-options"
              value={selectedRole}
              onChange={(event) => setSelectedRole(event.target.value)}
              minLength={2}
              maxLength={100}
              required
              placeholder="e.g. Backend Developer"
            />
            <datalist id="interview-role-options">
              {options.roles.map((role) => <option key={role} value={role} />)}
            </datalist>

            <fieldset className="setup-choice-group">
              <legend><InterviewIcon name="code" size={16} /> Technology</legend>
              <div className="setup-choice-grid">
                {options.technologies.map((item) => (
                  <label className={`setup-choice ${!customTechnology.trim() && technology === item ? 'selected' : ''}`} key={item}>
                    <input
                      type="radio"
                      name="interview-technology"
                      value={item}
                      checked={!customTechnology.trim() && technology === item}
                      onChange={(event) => {
                        setTechnology(event.target.value);
                        setCustomTechnology('');
                      }}
                    />
                    <span>{item}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="setup-field-label" htmlFor="interview-custom-technology">
              <InterviewIcon name="spark" size={16} /> Or enter another technology
            </label>
            <input
              id="interview-custom-technology"
              type="text"
              value={customTechnology}
              maxLength={80}
              autoComplete="off"
              placeholder="e.g. Go, Rust, Kubernetes, AI/ML"
              aria-describedby="custom-technology-help"
              onChange={(event) => {
                const value = event.target.value;
                const matchingPopular = options.technologies.find(
                  (item) => item.toLocaleLowerCase() === value.trim().replace(/\s+/gu, ' ').toLocaleLowerCase(),
                );
                if (matchingPopular && value.trim()) {
                  setTechnology(matchingPopular);
                  setCustomTechnology('');
                } else {
                  setTechnology('');
                  setCustomTechnology(value);
                }
              }}
            />
            <p id="custom-technology-help" className="interview-muted custom-technology-help">
              Custom technologies use AI-generated questions. If AI is unavailable, retry or choose a popular local-bank technology.
            </p>

            <fieldset className="setup-choice-group">
              <legend><InterviewIcon name="bolt" size={16} /> Difficulty</legend>
              <div className="setup-choice-grid setup-choice-grid-3">
                {options.difficulties.map((item) => (
                  <label className={`setup-choice ${difficulty === item ? 'selected' : ''}`} key={item}>
                    <input
                      type="radio"
                      name="interview-difficulty"
                      value={item}
                      checked={difficulty === item}
                      onChange={(event) => setDifficulty(event.target.value)}
                      required
                    />
                    <span>{item.charAt(0) + item.slice(1).toLocaleLowerCase()}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <label className="setup-field-label" htmlFor="interview-question-count"><InterviewIcon name="question" size={16} /> Number of questions</label>
            <input
              id="interview-question-count"
              type="number"
              min="1"
              max={options.maxQuestionCount}
              value={questionCount}
              onChange={(event) => setQuestionCount(event.target.value)}
              required
            />
            <fieldset className="setup-choice-group">
              <legend><InterviewIcon name="spark" size={16} /> Question source</legend>
              <div className="setup-source-options">
                <label className={`setup-source-option ${questionMode === 'AI' ? 'selected' : ''}`}>
                  <input type="radio" name="interview-question-mode" value="AI" checked={questionMode === 'AI'} onChange={(event) => setQuestionMode(event.target.value)} />
                  <InterviewIcon name="spark" size={18} />
                  <span><strong>AI-generated</strong><small>Falls back to a local bank when one exists for this technology.</small></span>
                </label>
                <label className={`setup-source-option ${questionMode === 'LOCAL' ? 'selected' : ''}`}>
                  <input type="radio" name="interview-question-mode" value="LOCAL" checked={questionMode === 'LOCAL'} onChange={(event) => setQuestionMode(event.target.value)} />
                  <InterviewIcon name="document" size={18} />
                  <span><strong>Local question bank</strong><small>Questions are selected without repetition.</small></span>
                </label>
              </div>
              <p className="interview-muted">
                Local-bank questions are not difficulty-tagged, so fallback questions may not match the selected difficulty.
              </p>
            </fieldset>
            <div className="setup-media-note">
              <span><InterviewIcon name="camera" size={18} /><InterviewIcon name="microphone" size={18} /></span>
              <div><strong>Camera + microphone</strong><small>AI interviewer reads each question aloud. Enable camera and microphone below if you want to use them.</small></div>
            </div>
            {error && <p className="error-text" role="alert">{error}</p>}
            <button type="submit" className="btn btn-primary" disabled={creating}>
              {creating ? 'Creating interview…' : <>Start interview <span aria-hidden="true">→</span></>}
            </button>
          </form>
          <InterviewMediaPreview />
        </div>
      )}
    </section>
  );
}
