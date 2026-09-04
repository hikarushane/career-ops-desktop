import { FolderIcon, ReloadIcon } from './icons';
import TaskChip from './TaskChip';
import UpdateBadge from './UpdateBadge';
import { t } from '../lib/i18n';
import type { UpdateState } from '../lib/updater';
import type { TaskRecord } from '../lib/taskStore';

type Props = {
  title: string;
  root: string;
  onReload: () => void;
  onChangeFolder: () => void;
  updateState?: UpdateState;
  onUpdateClick?: () => void;
  tasks: TaskRecord[];
  onOpenTask: (id: string) => void;
  onDismissTask: (id: string) => void;
};

/**
 * DESIGN.md §4.2's header profile block assumes a logged-in user (avatar,
 * name, email). This app has no login or team concept, so that slot is
 * repurposed as a "workspace block" showing the selected career-ops
 * folder instead of a person — see STITCH-PROMPT.md §4.1.
 */
export default function Header({
  title, root, onReload, onChangeFolder, updateState, onUpdateClick, tasks, onOpenTask, onDismissTask,
}: Props) {
  const segments = root.split('/').filter(Boolean);
  const folderName = segments[segments.length - 1] || root;

  return (
    <header className="app-header">
      <h1 className="app-header-title">{title}</h1>

      <div className="app-header-right">
        <div className="app-header-utilities">
          <TaskChip tasks={tasks} onOpen={onOpenTask} onDismiss={onDismissTask} />
          <button type="button" className="icon-button" onClick={onReload} title={t('Reload')} aria-label={t('Reload')}>
            <ReloadIcon />
          </button>
          <button type="button" className="icon-button" onClick={onChangeFolder} title={t('Change folder')} aria-label={t('Change folder')}>
            <FolderIcon />
          </button>
          {updateState && onUpdateClick && (
            <UpdateBadge state={updateState} onClick={onUpdateClick} />
          )}
        </div>

        <div className="app-header-divider" />

        <div className="app-header-workspace">
          <div className="workspace-glyph"><FolderIcon size={28} /></div>
          <div className="workspace-text">
            <div className="workspace-name">{folderName}</div>
            <div className="workspace-path" title={root}>{root}</div>
          </div>
        </div>
      </div>
    </header>
  );
}
