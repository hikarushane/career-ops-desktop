import { useEffect, useMemo, useState } from 'react';
import { listWorkspaceFiles, type Application, type ListResult, type WorkspaceFile } from '../api';
import { fileDate, groupInterviewFiles } from '../lib/interviewFiles';
import { loadReportWidth, saveReportWidth } from '../lib/splitResize';
import { useTasks } from '../lib/taskStore';
import Drawer from '../components/Drawer';
import FilePreview from '../components/FilePreview';

type Props = {
  root: string;
  data: ListResult;
  onAction: (action: string, app: Application) => void;
};

export default function Interview({ root, data, onAction }: Props) {
  const active = data.applications.filter((a) => a.normStatus === 'interview');
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [filesError, setFilesError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [reportWidth, setReportWidth] = useState(() => loadReportWidth(window.innerWidth));
  // Re-list when an interview turn finishes: that is when new prep files appear.
  const finishedInterviewTasks = useTasks().filter((t) => t.taskType.startsWith('interview') && t.state !== 'running').length;

  useEffect(() => {
    let live = true;
    listWorkspaceFiles(root, 'interview-prep')
      .then((list) => { if (live) { setFiles(list); setFilesError(null); } })
      .catch((reason) => live && setFilesError(reason instanceof Error ? reason.message : String(reason)));
    return () => { live = false; };
  }, [root, finishedInterviewTasks]);

  const groups = useMemo(() => groupInterviewFiles(files, active.map((a) => a.company)), [files, active]);

  const fileList = (list: WorkspaceFile[]) => (
    <ul className="prep-files">
      {list.map((f) => (
        <li key={f.path}>
          <button type="button" className="btn-link" onClick={() => setPreview(f.path)}>{f.path.replace(/^interview-prep\//, '')}</button>
          <span className="prep-file-date">{fileDate(f.modified)}</span>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="interview-screen">
      <h1>Interviews</h1>

      {active.length === 0 ? (
        <p className="empty-hint">No active interviews. Applications in Interview status will appear here.</p>
      ) : (
        <div className="interview-list">
          {active.map((a) => (
            <div key={a.number} className="interview-card">
              <div className="interview-card-header">
                <strong>{a.company}</strong>
                <span>{a.role}</span>
              </div>
              <div className="interview-card-actions">
                <button className="btn-secondary" onClick={() => onAction('interview-plan', a)}>
                  Prep plan
                </button>
                <button className="btn-secondary" onClick={() => onAction('interview-practice', a)}>
                  Practice
                </button>
                <button className="btn-secondary" onClick={() => onAction('interview-debrief', a)}>
                  Debrief
                </button>
              </div>
              {(groups.byCompany[a.company]?.length ?? 0) > 0 && (
                <div className="prep-files-block">
                  <p className="prep-files-title">Prep files</p>
                  {fileList(groups.byCompany[a.company])}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {filesError && <p className="intake-error" role="alert">{filesError}</p>}
      {groups.shared.length > 0 && (
        <section className="prep-files-block prep-files-shared">
          <p className="prep-files-title">Shared prep files</p>
          <p className="setup-hint">Story bank, question bank and other material the interview modes keep across companies.</p>
          {fileList(groups.shared)}
        </section>
      )}

      <Drawer
        open={preview !== null}
        onClose={() => setPreview(null)}
        width={reportWidth}
        onResize={setReportWidth}
        onResizeEnd={() => saveReportWidth(reportWidth)}
      >
        {preview && <FilePreview root={root} relative={preview} />}
      </Drawer>
    </div>
  );
}
