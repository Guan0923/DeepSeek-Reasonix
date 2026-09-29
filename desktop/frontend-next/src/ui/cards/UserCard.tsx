import { useEffect, useRef, useState } from "react";
import type { Checkpoint } from "../../port/port";
import type { Item } from "../../state/session";
import { reason } from "../../i18n/kernel";
import { t } from "../../i18n";
import { CopyButton } from "../CopyButton";
import { StudioIcon } from "../StudioIcon";
import { messageSource } from "../source";
import { useViewer } from "../../state/viewer";

export function UserCard({
  item,
  cp,
  onResend,
}: {
  item: Extract<Item, { t: "user" }>;
  cp?: Checkpoint;
  onResend?: (turn: number, text: string) => Promise<void>;
}) {
  // A rewind needs a turn the kernel claimed, and a queued line has not
  // happened yet — there is nothing behind it to take back.
  const editable = !!onResend && !!cp && !item.pending;
  const [draft, setDraft] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState("");
  const box = useRef<HTMLTextAreaElement>(null);
  const source = messageSource(item.via, useViewer());

  useEffect(() => {
    const el = box.current;
    if (draft === null || !el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [draft === null]);

  const resend = () => {
    const text = (draft ?? "").trim();
    if (!editable || !text || sending) return;
    setSending(true);
    setFailed("");
    onResend!(cp!.turn, text)
      .then(() => setDraft(null))
      .catch((e) => setFailed(reason(e)))
      .finally(() => setSending(false));
  };

  return (
    <div className="call" data-k="me" data-pending={item.pending ? "" : undefined}>
      <div className="g">
        <span className="sym">{t("你")}</span>
        <span className="line" />
      </div>
      <div className="c">
        {(item.steer || source) && <div className="hl user-hl">
          {item.steer && <span className="steermark">{t("插话")}</span>}
          {source && <span className="viamark">{source}</span>}
        </div>}
        <div className="out">
          {draft === null ? (
            <>
              <div className="txt" data-action={editable ? "turn.edit" : undefined}
                onDoubleClick={editable ? () => setDraft(item.text) : undefined}>{item.text}</div>
              <div className="user-acts">
                <CopyButton text={item.text} iconOnly label={t("复制消息")} />
                {editable && <button type="button" data-action="turn.edit" data-target={item.id}
                  title={t("改写这条消息并重新发送")} aria-label={t("改写这条消息")}
                  onClick={() => setDraft(item.text)}><StudioIcon name="rewind" /></button>}
              </div>
            </>
          ) : (
            <div className="reask">
              <textarea
                ref={box}
                data-action-change="turn.edit"
                data-action-keydown="turn.resend"
                data-target={item.id}
                value={draft}
                rows={Math.min(12, draft.split("\n").length + 1)}
                readOnly={sending}
                aria-label={t("改写这条消息")}
                onChange={(ev) => setDraft(ev.target.value)}
                onKeyDown={(ev) => {
                  if (ev.key === "Escape") {
                    ev.preventDefault();
                    ev.stopPropagation();
                    setDraft(null);
                  } else if (ev.key === "Enter" && !ev.shiftKey && !ev.nativeEvent.isComposing) {
                    ev.preventDefault();
                    resend();
                  }
                }}
              />
              {failed && <div className="txt bad">{failed}</div>}
              <div className="reask-ft">
                <button
                  className="btn"
                  data-action="turn.resend"
                  data-target={item.id}
                  disabled={sending || !draft.trim()}
                  onClick={resend}
                >
                  {sending ? t("正在重发…") : t("改完重发")}
                </button>
                <button className="dismiss" data-action="turn.edit" data-value="cancel" onClick={() => setDraft(null)}>
                  {t("取消")}
                </button>
                <span className="hint">{t("这一轮之后的记录会被丢弃")}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
