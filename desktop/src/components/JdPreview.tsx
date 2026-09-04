import { useEffect, useState } from 'react';
import { listWorkspaceFiles, type WorkspaceFile } from '../api';
import { jdCaptureFor } from '../lib/interviewFiles';
import FilePreview from './FilePreview';

type Props = { root: string; reportNumber: string };

/**
 * "View job description" for a tracker row: the JD capture under jds/ that
 * carries the row's report number, shown inline under the report actions.
 * Its own component so the report pane's state slots stay untouched.
 */
export default function JdPreview({ root, reportNumber }: Props) {
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let live = true;
    setOpen(false);
    listWorkspaceFiles(root, 'jds')
      .then((list) => live && setFiles(list))
      .catch(() => live && setFiles([]));
    return () => { live = false; };
  }, [root, reportNumber]);

  const capture = jdCaptureFor(files, reportNumber);

  return (
    <div className="jd-preview">
      <button
        type="button"
        className="btn-link"
        disabled={!capture}
        title={capture ? capture.path : 'No JD capture for this report under jds/'}
        onClick={() => setOpen((o) => !o)}
      >
        {capture ? (open ? 'Hide job description' : 'View job description') : 'No JD capture'}
      </button>
      {open && capture && <FilePreview root={root} relative={capture.path} />}
    </div>
  );
}
