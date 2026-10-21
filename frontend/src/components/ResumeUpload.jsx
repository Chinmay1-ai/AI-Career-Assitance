import { useAuth } from '@clerk/react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import InterviewIcon from './InterviewIcon.jsx';

const MAX_RESUME_BYTES = 5 * 1024 * 1024;
const RESUME_MIME_TYPES = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

function validateResumeFile(file) {
  const extension = file.name.split('.').pop()?.toLowerCase();
  const expectedMimeType = RESUME_MIME_TYPES[extension];

  if (!expectedMimeType || (file.type && file.type !== expectedMimeType)) {
    return 'Choose a PDF or DOCX file.';
  }
  if (file.size > MAX_RESUME_BYTES) {
    return 'File is too large. Maximum size is 5 MB.';
  }
  return '';
}

async function fetchUserResumes(getToken) {
  const token = await getToken();
  if (!token) throw new Error('Sign in is required to load resumes.');
  const response = await fetch('/api/resumes', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Could not load resumes.');
  }
  return data.resumes ?? [];
}

function AnalysisList({ title, items }) {
  if (items.length === 0) return null;
  const lowerTitle = title.toLocaleLowerCase();
  const icon = lowerTitle.includes('skill') ? 'code'
    : lowerTitle.includes('education') ? 'book'
      : lowerTitle.includes('achievement') ? 'check'
        : lowerTitle.includes('experience') ? 'briefcase'
          : lowerTitle.includes('project') ? 'bolt'
            : lowerTitle.includes('link') ? 'replay'
              : lowerTitle.includes('certification') ? 'shield'
                : 'document';
  return (
    <section className="analysis-section">
      <h5><InterviewIcon name={icon} size={14} /> {title}</h5>
      <ul>
        {items.map((item, index) => (
          <li key={`${title}-${index}`}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

function AnalysisEntries({ title, icon, entries }) {
  if (entries.length === 0) return null;

  return (
    <section className="analysis-section analysis-record-section">
      <h5><InterviewIcon name={icon} size={14} /> {title}</h5>
      <div className="analysis-entry-list">
        {entries.map((entry, index) => (
          <article className="analysis-entry" key={`${title}-${index}`}>
            <strong>{entry.title}</strong>
            {entry.subtitle && <p>{entry.subtitle}</p>}
            {entry.details.length > 0 && (
              <p className="analysis-entry-meta">{entry.details.join(' · ')}</p>
            )}
            {entry.items.length > 0 && (
              <ul>{entry.items.map((item, itemIndex) => (
                <li key={`${title}-${index}-${itemIndex}`}>{item}</li>
              ))}</ul>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

function ResumeAnalysis({ analysis }) {
  const candidate = analysis.candidate;
  const profile = [candidate.fullName, candidate.headline, candidate.location]
    .filter(Boolean)
    .join(' · ');
  const skillGroups = [
    ['Programming languages', analysis.skills.programmingLanguages],
    ['Frameworks and libraries', analysis.skills.frameworksLibraries],
    ['Databases', analysis.skills.databases],
    ['Tools and technologies', analysis.skills.toolsTechnologies],
    ['Other skills', analysis.skills.other],
  ];
  const hasProfile = Boolean(
    profile || analysis.professionalSummary || candidate.email || candidate.phone,
  );
  const candidateLinks = Object.entries(candidate.links)
    .filter(([, url]) => url)
    .map(([label, url]) => `${label}: ${url}`);
  const educationEntries = analysis.education.map((item) => ({
    title: [item.degree, item.fieldOfStudy].filter(Boolean).join(' · ') || item.institution,
    subtitle: item.degree || item.fieldOfStudy ? item.institution : '',
    details: [
      item.location,
      [item.startDate, item.endDate].filter(Boolean).join(' - '),
    ].filter(Boolean),
    items: item.details,
  }));
  const experienceEntries = analysis.experience.map((item) => ({
    title: `${item.title} · ${item.organization}`,
    subtitle: item.type,
    details: [
      item.location,
      [item.startDate, item.isCurrent ? 'Present' : item.endDate]
        .filter(Boolean)
        .join(' - '),
    ].filter(Boolean),
    items: item.responsibilities,
  }));
  const projectEntries = analysis.projects.map((item) => ({
    title: item.name,
    subtitle: item.role,
    details: [
      item.description,
      item.technologies.length ? `Technologies: ${item.technologies.join(', ')}` : '',
      item.url,
    ].filter(Boolean),
    items: [],
  }));
  const certificationEntries = analysis.certifications.map((item) => ({
    title: item.name,
    subtitle: item.issuer,
    details: [item.date, item.credentialId, item.url].filter(Boolean),
    items: [],
  }));

  return (
    <div className="resume-analysis">
      <h3><span className="resume-inline-icon"><InterviewIcon name="spark" size={17} /></span> AI resume analysis</h3>
      <div className="analysis-groups">
        {hasProfile && (
          <section className="analysis-section analysis-profile-section">
            <h5><InterviewIcon name="spark" size={14} /> Profile summary</h5>
            {profile && <p className="analysis-profile-heading">{profile}</p>}
            {analysis.professionalSummary && <p>{analysis.professionalSummary}</p>}
            {(candidate.email || candidate.phone) && (
              <p className="analysis-entry-meta">
                {[candidate.email, candidate.phone].filter(Boolean).join(' · ')}
              </p>
            )}
          </section>
        )}
        {skillGroups.map(([title, items]) => (
          <AnalysisList key={title} title={title} items={items} />
        ))}
        <AnalysisList title="Achievements" items={analysis.achievements} />
        <AnalysisEntries
          title="Education"
          icon="book"
          entries={educationEntries}
        />
        <AnalysisEntries
          title="Experience"
          icon="briefcase"
          entries={experienceEntries}
        />
        <AnalysisEntries
          title="Projects"
          icon="bolt"
          entries={projectEntries}
        />
        <AnalysisEntries
          title="Certifications"
          icon="shield"
          entries={certificationEntries}
        />
        <AnalysisList title="Profile links" items={candidateLinks} />
        {analysis.additionalSections.map((item, index) => (
          <AnalysisList
            key={`${item.heading}-${index}`}
            title={item.heading}
            items={item.items}
          />
        ))}
      </div>
    </div>
  );
}

function ResumeAnalysisSummary({ analysis }) {
  const candidate = analysis.candidate;
  const profile = [
    candidate.fullName,
    candidate.headline,
    candidate.location,
  ].filter(Boolean).join(' · ');
  const skillGroups = [
    ['Programming languages', 'code', analysis.skills.programmingLanguages],
    ['Frameworks and libraries', 'bolt', analysis.skills.frameworksLibraries],
    ['Databases', 'database', analysis.skills.databases],
    ['Tools and technologies', 'spark', analysis.skills.toolsTechnologies],
    ['Other skills', 'check', analysis.skills.other],
  ].filter(([, , items]) => items.length > 0);

  return (
    <section className="resume-analysis-summary">
      <div className="resume-analysis-summary-heading">
        <h4><InterviewIcon name="spark" size={15} /> Analysis summary</h4>
        {profile && <span>{profile}</span>}
      </div>
      {analysis.professionalSummary && (
        <p className="resume-summary-copy">{analysis.professionalSummary}</p>
      )}
      {skillGroups.length > 0 && (
        <div className="resume-summary-skills">
          {skillGroups.map(([title, icon, items]) => (
            <section className="resume-summary-skill-group" key={title}>
              <h5><InterviewIcon name={icon} size={13} /> {title}</h5>
              <div className="resume-skill-tags">
                {items.slice(0, 4).map((skill) => <span key={skill}>{skill}</span>)}
                {items.length > 4 && (
                  <span className="resume-skill-more">+{items.length - 4} more</span>
                )}
              </div>
            </section>
          ))}
        </div>
      )}
      {!profile && !analysis.professionalSummary && skillGroups.length === 0 && (
        <p className="resume-summary-copy">
          Open the complete analysis to review the saved resume details.
        </p>
      )}
    </section>
  );
}

function SkillGapAnalysis({ analysis }) {
  const suggestionsBySkill = new Map(
    analysis.learningSuggestions.map((item) => [item.skill.toLocaleLowerCase(), item]),
  );

  return (
    <section className="skill-gap-analysis">
      <h5><InterviewIcon name="chart" size={16} /> Skill gap analysis · {analysis.roleTitle}</h5>
      <AnalysisList title="Current relevant skills" items={analysis.currentSkills} />
      <section>
        <h5><InterviewIcon name="target" size={15} /> Skill gaps</h5>
        {analysis.skillGaps.length === 0 ? (
          <p>No specific skill gaps were identified in this recommendation.</p>
        ) : (
          <ul>
            {analysis.skillGaps.map((gap) => (
              <li key={gap.skill}>
                <strong>{gap.skill}</strong>
                <span className={`skill-priority skill-priority-${gap.importance.toLowerCase()}`}>
                  {gap.importance} importance
                </span>
                <p>{gap.reason}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
      {analysis.learningSuggestions.length > 0 && (
        <section>
          <h5><InterviewIcon name="book" size={15} /> Learning suggestions</h5>
          <ul>
            {analysis.learningSuggestions.map((item) => (
              <li key={item.skill}>
                <strong>{item.skill}</strong>
                <span className={`skill-priority skill-priority-${item.priority.toLowerCase()}`}>
                  {item.priority} priority
                </span>
                <p>{item.suggestion}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
      {analysis.skillGaps.some(
        (gap) => !suggestionsBySkill.has(gap.skill.toLocaleLowerCase()),
      ) && <p className="error-text">Some learning suggestions are unavailable.</p>}
    </section>
  );
}

function CareerRecommendations({
  recommendations,
  onSkillGap,
  onPractice,
  skillGapBusy,
  analyzingRole,
  skillGapAnalysis,
}) {
  return (
    <section className="career-recommendations">
      <h4><span className="resume-inline-icon resume-inline-violet"><InterviewIcon name="target" size={17} /></span> Career recommendations</h4>
      {recommendations.length === 0 ? (
        <p>No roles had enough evidence for a responsible recommendation.</p>
      ) : <ol>
        {recommendations.map((recommendation) => (
          <li key={recommendation.roleTitle} className="career-recommendation">
            <div className="career-recommendation-heading">
              <h5><InterviewIcon name="briefcase" size={16} /> {recommendation.roleTitle}</h5>
              <strong><InterviewIcon name="target" size={14} /> {recommendation.matchPercentage}% match</strong>
            </div>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={skillGapBusy}
              onClick={() => onSkillGap(recommendation.roleTitle)}
            >
              {skillGapBusy && analyzingRole === recommendation.roleTitle
                ? 'Analyzing skill gaps…'
                : 'Analyze skill gaps'}
            </button>
            <button
                type="button"
                className="btn btn-primary"
                onClick={() => onPractice(recommendation)}
            >
                Practice mock interview
            </button>
            <p>{recommendation.reason}</p>
            <AnalysisList title="Matching skills" items={recommendation.matchingSkills} />
            <AnalysisList
              title="Missing or weak skills"
              items={recommendation.missingOrWeakSkills}
            />
            <AnalysisList title="Recommended next skills" items={recommendation.nextSkills} />
            {skillGapAnalysis?.roleTitle === recommendation.roleTitle && (
              <SkillGapAnalysis analysis={skillGapAnalysis} />
            )}
          </li>
        ))}
      </ol>}
    </section>
  );
}

export default function ResumeUpload() {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const navigate = useNavigate();
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [latest, setLatest] = useState(null);
  const [resumes, setResumes] = useState([]);
  const [analyzingResumeId, setAnalyzingResumeId] = useState(null);
  const [analysisErrors, setAnalysisErrors] = useState({});
  const [analysisSuccesses, setAnalysisSuccesses] = useState({});
  const [recommendingResumeId, setRecommendingResumeId] = useState(null);
  const [recommendationErrors, setRecommendationErrors] = useState({});
  const [recommendationSuccesses, setRecommendationSuccesses] = useState({});
  const [skillGapResumeId, setSkillGapResumeId] = useState(null);
  const [skillGapRoleTitle, setSkillGapRoleTitle] = useState('');
  const [skillGapErrors, setSkillGapErrors] = useState({});
  const [skillGapSuccesses, setSkillGapSuccesses] = useState({});
  const [viewingResumeId, setViewingResumeId] = useState(null);
  const [analysisExpanded, setAnalysisExpanded] = useState(false);
  const viewingResume = resumes.find((resume) => resume.id === viewingResumeId);

  function selectResume(resumeId) {
    setViewingResumeId(resumeId);
    setAnalysisExpanded(false);
  }

  const practiceRecommendation = (resumeId, recommendation) => {
    const knownTechnologies = [
      ['JavaScript', ['javascript', 'js']],
      ['Spring Boot', ['spring boot', 'springboot']],
      ['Node.js', ['node.js', 'nodejs', 'node']],
      ['HTML & CSS', ['html & css', 'html/css', 'html', 'css']],
      ['MongoDB', ['mongodb', 'mongo']],
      ['React', ['react']],
      ['Python', ['python']],
      ['Java', ['java']],
      ['SQL', ['sql']],
      ['C++', ['c++', 'cpp']],
    ];
    const recommendationSkills = [
      ...recommendation.matchingSkills,
      ...recommendation.nextSkills,
      ...recommendation.missingOrWeakSkills,
    ].map((skill) => skill.toLocaleLowerCase());
    const technology = knownTechnologies.find(([, aliases]) =>
      recommendationSkills.some((skill) =>
        aliases.some((alias) => skill === alias || skill.includes(alias)),
      ),
    )?.[0];
    const search = new URLSearchParams({ role: recommendation.roleTitle });
    if (technology) search.set('technology', technology);
    search.set('resumeId', resumeId);
    navigate(`/interviews/new?${search.toString()}`);
  };

  const loadResumes = useCallback(async () => {
    if (!isSignedIn) return;
    try {
      setResumes(await fetchUserResumes(getToken));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load resumes.');
    }
  }, [getToken, isSignedIn]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return undefined;
    let active = true;
    fetchUserResumes(getToken)
      .then((loadedResumes) => {
        if (active) setResumes(loadedResumes);
      })
      .catch((loadError) => {
        if (active) {
          setError(
            loadError instanceof Error ? loadError.message : 'Could not load resumes.',
          );
        }
      });
    return () => {
      active = false;
    };
  }, [getToken, isLoaded, isSignedIn]);

  function handleFileChange(event) {
    const selectedFile = event.target.files?.[0] ?? null;
    setLatest(null);
    if (!selectedFile) {
      setFile(null);
      setError('');
      return;
    }

    const validationError = validateResumeFile(selectedFile);
    if (validationError) {
      setFile(null);
      event.target.value = '';
      setError(validationError);
      return;
    }

    setFile(selectedFile);
    setError('');
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setLatest(null);

    if (!isLoaded || !isSignedIn) {
      setError('Sign in is required to upload a resume.');
      return;
    }
    if (!file) {
      setError('Please choose a PDF or DOCX file.');
      return;
    }
    const validationError = validateResumeFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    setBusy(true);
    try {
      const token = await getToken();
      if (!token) throw new Error('Sign in is required to upload a resume.');
      const response = await fetch('/api/resumes', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || 'Upload failed.');
      }
      setLatest(data);
      setFile(null);
      event.target.reset();
      await loadResumes();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Upload failed.');
    } finally {
      setBusy(false);
    }
  }

  async function handleSkillGapAnalysis(resumeId, roleTitle) {
    setSkillGapErrors((current) => ({ ...current, [resumeId]: '' }));
    setSkillGapSuccesses((current) => ({ ...current, [resumeId]: '' }));
    setSkillGapResumeId(resumeId);
    setSkillGapRoleTitle(roleTitle);

    try {
      const token = await getToken();
      if (!token) throw new Error('Sign in is required to analyze skill gaps.');
      const response = await fetch(
        `/api/resumes/${encodeURIComponent(resumeId)}/skill-gaps`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ roleTitle }),
        },
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 503 || data.code === 'AI_TEMPORARILY_UNAVAILABLE') {
          throw new Error('AI analysis is temporarily unavailable. Please try again later.');
        }
        throw new Error(data.error || 'Skill gap analysis failed.');
      }

      setResumes((current) => current.map((resume) =>
        resume.id === resumeId
          ? { ...resume, skillGapAnalysisJson: data.skillGapAnalysis }
          : resume,
      ));
      setSkillGapSuccesses((current) => ({
        ...current,
        [resumeId]: data.cached
          ? 'Saved skill gap analysis loaded.'
          : 'Skill gap analysis generated and saved.',
      }));
    } catch (analysisError) {
      setSkillGapErrors((current) => ({
        ...current,
        [resumeId]: analysisError instanceof Error
          ? analysisError.message
          : 'Skill gap analysis failed.',
      }));
    } finally {
      setSkillGapResumeId(null);
      setSkillGapRoleTitle('');
    }
  }

  async function handleAnalyze(resumeId) {
    setAnalysisErrors((current) => ({ ...current, [resumeId]: '' }));
    setAnalysisSuccesses((current) => ({ ...current, [resumeId]: '' }));
    setAnalyzingResumeId(resumeId);

    try {
      const token = await getToken();
      if (!token) throw new Error('Sign in is required to analyze a resume.');
      const response = await fetch(`/api/resumes/${encodeURIComponent(resumeId)}/analyze`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Resume analysis failed.');

      selectResume(resumeId);
      setResumes((current) => current.map((resume) =>
        resume.id === resumeId
          ? {
            ...resume,
            analysisJson: data.analysis,
            careerRecommendationsCurrent: false,
            skillGapAnalysisJson: null,
          }
          : resume,
      ));
      setAnalysisSuccesses((current) => ({ ...current, [resumeId]: 'Analysis saved.' }));
    } catch (analysisError) {
      setAnalysisErrors((current) => ({
        ...current,
        [resumeId]: analysisError instanceof Error
          ? analysisError.message
          : 'Resume analysis failed.',
      }));
    } finally {
      setAnalyzingResumeId(null);
    }
  }

  async function handleRecommendations(resumeId) {
    setRecommendationErrors((current) => ({ ...current, [resumeId]: '' }));
    setRecommendationSuccesses((current) => ({ ...current, [resumeId]: '' }));
    setRecommendingResumeId(resumeId);
    selectResume(resumeId);
    setViewingResumeId(resumeId);

    try {
      const token = await getToken();
      if (!token) throw new Error('Sign in is required to generate recommendations.');
      const response = await fetch(
        `/api/resumes/${encodeURIComponent(resumeId)}/recommendations`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || 'Career recommendation generation failed.');
      }

      setResumes((current) => current.map((resume) =>
        resume.id === resumeId
          ? {
            ...resume,
            careerRecommendationsJson: data.recommendations,
            careerRecommendationsCurrent: true,
            skillGapAnalysisJson: null,
          }
          : resume,
      ));
      setRecommendationSuccesses((current) => ({
        ...current,
        [resumeId]: data.cached ? 'Saved recommendations loaded.' : 'Recommendations generated and saved.',
      }));
    } catch (recommendationError) {
      setRecommendationErrors((current) => ({
        ...current,
        [resumeId]: recommendationError instanceof Error
          ? recommendationError.message
          : 'Career recommendation generation failed.',
      }));
    } finally {
      setRecommendingResumeId(null);
    }
  }

  return (
    <section className="resume-panel" id="resume-panel">
      <div className="resume-panel-heading">
        <span className="resume-heading-icon"><InterviewIcon name="document" size={20} /></span>
        <div>
          <p className="eyebrow"><InterviewIcon name="spark" size={14} /> CAREER PROFILE</p>
          <h2>Resume workspace</h2>
        </div>
      </div>
      <p className="lead resume-intro">
        Upload a PDF or DOCX file, then analyze the extracted resume text with AI.
      </p>

      <form className="resume-form" onSubmit={handleSubmit}>
        <label className="resume-dropzone" htmlFor="resume-file">
          <span className="resume-dropzone-icon"><InterviewIcon name="upload" size={22} /></span>
          <strong>{file?.name || 'Choose a resume to get started'}</strong>
          <small>PDF or DOCX · up to 5 MB</small>
          <span className="btn btn-secondary"><InterviewIcon name="document" size={16} /> Browse files</span>
        </label>
        <input
          id="resume-file"
          className="resume-file-input"
          type="file"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={handleFileChange}
        />
        <button type="submit" className="btn btn-primary" disabled={busy}>
          <InterviewIcon name="spark" size={16} /> {busy ? 'Uploading…' : 'Upload resume'}
        </button>
      </form>

      {error && <p className="error-text">{error}</p>}

      {latest && (
        <article className="card resume-result">
          <h3><InterviewIcon name="document" size={17} /> Extracted text</h3>
          <p>
            <strong>{latest.originalFilename}</strong> — {latest.characterCount}{' '}
            characters
          </p>
          <p className="resume-preview">{latest.textPreview}</p>
        </article>
      )}

      {resumes.length > 0 ? (
        <div className="resume-viewer">
          <div className="resume-history">
            <div className="resume-history-heading">
              <h3>Your uploads</h3>
              <span>{resumes.length}</span>
            </div>
            <ul>
              {resumes.map((item) => {
                const busyForResume = analyzingResumeId !== null ||
                  recommendingResumeId !== null || skillGapResumeId !== null;
                return (
                  <li key={item.id} className={`resume-item ${viewingResumeId === item.id ? 'is-selected' : ''}`}>
                    <div className="resume-item-heading">
                      <div className="resume-item-info">
                        <strong title={item.originalFilename}>{item.originalFilename}</strong>
                        <span>
                          <InterviewIcon name="clock" size={13} />
                          <time dateTime={item.createdAt}>
                            {new Date(item.createdAt).toLocaleDateString()}
                          </time>
                          <span>· {item.characterCount} characters</span>
                        </span>
                        <span className={`resume-analysis-status ${item.analysisJson ? 'is-ready' : ''}`}>
                          <i />
                          {analyzingResumeId === item.id
                            ? 'Analysis in progress'
                            : item.analysisJson ? 'Analysis saved' : 'Not analyzed'}
                        </span>
                      </div>
                      <div className="resume-actions">
                        <button
                          type="button"
                          className="btn btn-ghost"
                          disabled={busyForResume}
                          onClick={() => handleAnalyze(item.id)}
                        >
                          {analyzingResumeId === item.id
                            ? 'Analyzing…'
                            : item.analysisJson ? 'Analyze again' : 'Analyze resume'}
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          disabled={!item.analysisJson || busyForResume}
                          onClick={() => handleRecommendations(item.id)}
                        >
                          {recommendingResumeId === item.id
                            ? 'Generating…'
                            : item.careerRecommendationsJson
                              ? 'Refresh recommendations'
                              : 'Get recommendations'}
                        </button>
                        {item.analysisJson && (
                          <button
                            type="button"
                            className="btn btn-secondary resume-view-button"
                            aria-pressed={viewingResumeId === item.id}
                            onClick={() => selectResume(item.id)}
                          >
                            <InterviewIcon name="document" size={15} />
                            View analysis
                          </button>
                        )}
                      </div>
                    </div>
                    {analysisErrors[item.id] && (
                      <p className="error-text" role="alert">{analysisErrors[item.id]}</p>
                    )}
                    {analysisSuccesses[item.id] && (
                      <p className="success-text" role="status">{analysisSuccesses[item.id]}</p>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="resume-analysis-detail" aria-live="polite">
            {viewingResume ? (
              <>
                <div className="resume-analysis-toolbar">
                  <div>
                    <p className="eyebrow"><InterviewIcon name="spark" size={14} /> SAVED ANALYSIS</p>
                    <h3 title={viewingResume.originalFilename}>{viewingResume.originalFilename}</h3>
                    <span>Uploaded {new Date(viewingResume.createdAt).toLocaleDateString()}</span>
                  </div>
                  <label className="resume-analysis-switcher">
                    <span>Switch resume</span>
                    <select
                      value={viewingResume.id}
                      onChange={(event) => selectResume(event.target.value)}
                    >
                      {resumes.filter((resume) => resume.analysisJson).map((resume) => (
                        <option key={resume.id} value={resume.id}>
                          {resume.originalFilename}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <ResumeAnalysisSummary analysis={viewingResume.analysisJson} />
                {viewingResume.careerRecommendationsJson &&
                  !viewingResume.careerRecommendationsCurrent && (
                    <div className="career-recommendations-empty">
                      <div>
                        <h4><InterviewIcon name="target" size={16} /> Saved recommendations</h4>
                        <p>Refresh the saved recommendations for this analysis.</p>
                      </div>
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={
                          analyzingResumeId !== null ||
                          recommendingResumeId !== null ||
                          skillGapResumeId !== null
                        }
                        onClick={() => handleRecommendations(viewingResume.id)}
                      >
                        <InterviewIcon name="replay" size={15} />
                        {recommendingResumeId === viewingResume.id
                          ? 'Generating…'
                          : 'Refresh recommendations'}
                      </button>
                    </div>
                )}
                {viewingResume.careerRecommendationsJson &&
                  viewingResume.careerRecommendationsCurrent && (
                    <CareerRecommendations
                      recommendations={viewingResume.careerRecommendationsJson.recommendations}
                      onSkillGap={(roleTitle) =>
                        handleSkillGapAnalysis(viewingResume.id, roleTitle)
                      }
                      onPractice={(recommendation) =>
                        practiceRecommendation(viewingResume.id, recommendation)
                      }
                      skillGapBusy={
                        analyzingResumeId !== null ||
                        recommendingResumeId !== null ||
                        skillGapResumeId !== null
                      }
                      analyzingRole={skillGapRoleTitle}
                      skillGapAnalysis={viewingResume.skillGapAnalysisJson}
                    />
                )}
                {!viewingResume.careerRecommendationsJson && (
                  <section className="career-recommendations-empty">
                    <div>
                      <h4><InterviewIcon name="target" size={16} /> Career recommendations</h4>
                      <p>Explore roles based on this saved resume analysis.</p>
                    </div>
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={
                        analyzingResumeId !== null ||
                        recommendingResumeId !== null ||
                        skillGapResumeId !== null
                      }
                      onClick={() => handleRecommendations(viewingResume.id)}
                    >
                      <InterviewIcon name="spark" size={15} />
                      {recommendingResumeId === viewingResume.id
                        ? 'Generating…'
                        : 'Get recommendations'}
                    </button>
                  </section>
                )}
                {recommendationErrors[viewingResume.id] && (
                  <p className="error-text" role="alert">
                    {recommendationErrors[viewingResume.id]}
                  </p>
                )}
                {recommendationSuccesses[viewingResume.id] && (
                  <p className="success-text" role="status">
                    {recommendationSuccesses[viewingResume.id]}
                  </p>
                )}
                {skillGapErrors[viewingResume.id] && (
                  <p className="error-text" role="alert">
                    {skillGapErrors[viewingResume.id]}
                  </p>
                )}
                {skillGapSuccesses[viewingResume.id] && (
                  <p className="success-text" role="status">
                    {skillGapSuccesses[viewingResume.id]}
                  </p>
                )}
                <section className="resume-full-analysis">
                  <button
                    type="button"
                    className="resume-analysis-expand"
                    aria-expanded={analysisExpanded}
                    onClick={() => setAnalysisExpanded((expanded) => !expanded)}
                  >
                    <span>
                      <InterviewIcon name="document" size={15} />
                      {analysisExpanded
                        ? 'Hide complete resume analysis'
                        : 'View complete resume analysis'}
                    </span>
                    <InterviewIcon name="replay" size={14} />
                  </button>
                  {analysisExpanded && (
                    <ResumeAnalysis analysis={viewingResume.analysisJson} />
                  )}
                </section>
              </>
            ) : (
              <div className="resume-analysis-empty">
                <span className="resume-heading-icon">
                  <InterviewIcon name="document" size={20} />
                </span>
                <h3>Select a saved analysis</h3>
                <p>Choose View analysis on a resume to review its saved profile and recommendations.</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="resume-history-empty">
          <InterviewIcon name="document" size={20} />
          <p>Your uploaded resumes will appear here.</p>
        </div>
      )}
    </section>
  );
}
