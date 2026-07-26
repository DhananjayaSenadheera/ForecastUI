// Play/stop control for the ingestion service, sitting in front of the
// "Ingestion service is Running/Stopped" line on the ingestion status card.
//
// Three rules this component exists to keep honest:
//  1. The START button runs ONE INGESTION PASS and nothing else. Verification, feature
//     building and model training stay with the nightly pipeline, so the confirmation
//     says so instead of letting an admin assume "run" means "run everything".
//  2. STOP can only cancel a pass this API hosts. A pass started by the scheduled
//     worker answers 409 not_stoppable, and that is stated up front in the dialog AND
//     repeated verbatim if the server answers it.
//  3. Every 409 means our snapshot was wrong, so the status is refetched after EVERY
//     response — success or refusal. A refusal is a change of truth, not an error.
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../api/client';
import { isIngestionServiceError, type IngestionServiceErrorCode, type IngestionState } from '../api/types';
import { truncateId } from '../lib/format';
import { AdminDialog } from './adminShared';
import { IconPlay, IconStop } from './icons';

type Action = 'start' | 'stop';

/** What the user is told after a request settles. `tone` drives the live-region role:
 *  a refusal is information (polite), a broken request is an alert (assertive). */
interface Notice {
  tone: 'info' | 'error';
  text: string;
}

const NOTICE_ID = 'ing-service-notice';
const DIALOG_BODY_ID = 'ing-service-dialog-body';

export default function IngestionServiceControl({
  state,
  onChanged,
}: {
  state: IngestionState;
  /** Refetch the status snapshot — called after EVERY response, including 409s. */
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState<Action | null>(null);
  const [pending, setPending] = useState<Action | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  // Only a state we KNOW is running offers Stop. 'unknown' offers Start, because the
  // server's single-flight lock makes a redundant start harmless (it answers 409
  // already_running) while a redundant stop would just be a lie about what is running.
  const action: Action = state === 'running' ? 'stop' : 'start';

  const run = useCallback(
    async (which: Action) => {
      setConfirming(null);
      setPending(which);
      setNotice(null);
      try {
        if (which === 'start') {
          const res = await api.startIngestionService();
          setNotice({
            tone: 'info',
            text: t('admin.ingestion.service.startedNotice', {
              batch: truncateId(res.batchId) || t('admin.ingestion.notApplicable'),
            }),
          });
        } else {
          await api.stopIngestionService();
          setNotice({ tone: 'info', text: t('admin.ingestion.service.stoppedNotice') });
        }
      } catch (e) {
        setNotice(explain(e, t));
      } finally {
        setPending(null);
        // The truth moved (or we proved we did not know it) — reread it either way.
        onChanged();
      }
    },
    [t, onChanged],
  );

  const busy = pending !== null;
  const label =
    action === 'start'
      ? busy
        ? t('admin.ingestion.service.starting')
        : t('admin.ingestion.service.start')
      : busy
        ? t('admin.ingestion.service.stopping')
        : t('admin.ingestion.service.stop');

  return (
    <>
      <div className="ing-svc">
        {/* One button element for both actions so focus survives the play <-> stop swap
            when the dialog closes and the status refetches. */}
        <button
          type="button"
          className={`adm-rowbtn ing-svcbtn ing-svcbtn--${action}`}
          onClick={() => setConfirming(action)}
          disabled={busy}
          aria-busy={busy}
          {...(notice ? { 'aria-describedby': NOTICE_ID } : {})}
        >
          {action === 'start' ? <IconPlay /> : <IconStop />}
          {/* The label is real text, never icon-only: the icon is aria-hidden. */}
          {label}
        </button>
        {state === 'unknown' && (
          <span className="ing-svc__hint adm-muted">{t('admin.ingestion.service.unknownNote')}</span>
        )}
      </div>

      {notice && (
        <p
          id={NOTICE_ID}
          className={`adm-note${notice.tone === 'error' ? ' adm-note--error' : ''}`}
          role={notice.tone === 'error' ? 'alert' : 'status'}
        >
          {notice.text}
        </p>
      )}

      {confirming && (
        <AdminDialog
          title={t(`admin.ingestion.service.${confirming}Title`)}
          describedBy={DIALOG_BODY_ID}
          onClose={() => setConfirming(null)}
        >
          <div id={DIALOG_BODY_ID}>
            <p>{t(`admin.ingestion.service.${confirming}Body`)}</p>
            {/* The scope caveat is the whole point of the confirmation — it is body
                copy inside aria-describedby, not a tooltip an admin can miss. */}
            <p className="adm-warn" role="note">
              <span aria-hidden="true">⚠️ </span>
              {t(`admin.ingestion.service.${confirming}Scope`)}
            </p>
          </div>
          <div className="adm-form__actions">
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setConfirming(null)}
              disabled={busy}
            >
              {t('admin.ingestion.service.cancel')}
            </button>
            <button
              type="button"
              className={confirming === 'stop' ? 'adm-btn adm-btn--danger' : 'adm-btn'}
              onClick={() => void run(confirming)}
              disabled={busy}
            >
              {t(`admin.ingestion.service.${confirming}Confirm`)}
            </button>
          </div>
        </AdminDialog>
      )}
    </>
  );
}

/** One row per 409 code — a Record (not a switch) so adding a code to the contract
 *  fails the build here until this screen has a sentence for it. */
const NOTICE_KEY_BY_CODE: Record<IngestionServiceErrorCode, string> = {
  already_running: 'admin.ingestion.service.alreadyRunning',
  not_running: 'admin.ingestion.service.notRunning',
  not_stoppable: 'admin.ingestion.service.notStoppable',
};

/** Turn a failed control request into the sentence the admin should read. The three
 *  409 codes are NOT failures — they are the server telling us the truth changed — so
 *  they come back as polite information; everything else is the page's normal error. */
function explain(e: unknown, t: (k: string) => string): Notice {
  const code = e instanceof ApiError && e.status === 409 ? e.code : null;
  if (isIngestionServiceError(code)) return { tone: 'info', text: t(NOTICE_KEY_BY_CODE[code]) };
  // Network, 500, or a 409 code this build has never heard of: do not invent a
  // reassuring explanation for something we cannot name.
  return { tone: 'error', text: t('common.errorBody') };
}
