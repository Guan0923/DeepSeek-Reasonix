import { useMemo, useState } from "react";
import { t } from "../i18n";
import type { AgentPort } from "../port/port";
import contributors from "../data/contributors.json";
import qrSrc from "../assets/qq-group-qr.svg";
import { CopyButton } from "./CopyButton";
import { COMMUNITY, profileUrl } from "./communityLinks";

const COLLAPSED = 24;

export function Community({ port, logins = contributors }: { port: Pick<AgentPort, "openExternal">; logins?: string[] }) {
  const [all, setAll] = useState(false);
  const [failed, setFailed] = useState("");

  const open = (url: string) =>
    void port.openExternal(url).then(() => setFailed(""), () => setFailed(t("无法打开浏览器，请手动访问 {at}", { at: url })));

  const people = useMemo(
    () => logins.flatMap((login) => { const url = profileUrl(login); return url ? [{ login, url }] : []; }),
    [logins],
  );
  const shown = all ? people : people.slice(0, COLLAPSED);

  return (
    <div className="comm">
      <div className="comm-join">
        <img className="comm-qr" src={qrSrc} alt={t("QQ 群二维码")} width={185} height={185} />
        <div className="comm-qq">
          <span className="comm-name">{COMMUNITY.qqName}</span>
          <span className="comm-num">
            <span className="comm-k">{t("群号")}</span>
            <code>{COMMUNITY.qqNumber}</code>
            <CopyButton text={COMMUNITY.qqNumber} iconOnly showFeedback label={t("复制群号")} />
          </span>
          <span className="comm-how">{t("用 QQ 扫描二维码，或点击下方按钮加入。")}</span>
          <span className="comm-acts">
            <button type="button" className="btn" data-primary data-action="community.join" onClick={() => open(COMMUNITY.qqJoin)}>{t("加入 QQ 群")}</button>
            <button type="button" className="btn" data-action="community.discord" onClick={() => open(COMMUNITY.discord)}>Discord</button>
            <button type="button" className="btn" data-action="community.issues" onClick={() => open(COMMUNITY.issues)}>GitHub issues</button>
          </span>
        </div>
      </div>

      {failed && <p className="comm-fail" role="alert">{failed}</p>}

      <div className="comm-who">
        <div className="comm-who-hd">
          <h4>{t("贡献者")}</h4>
          <span className="comm-k">{t("按提交数排序，名单随版本更新")}</span>
          <button type="button" className="btn sm" data-action="community.contributors" onClick={() => open(COMMUNITY.contributors)}>{t("查看全部贡献者")}</button>
        </div>
        <ul className="comm-list" aria-label={t("贡献者")}>
          {shown.map(({ login, url }) => (
            <li key={login}>
              <a href={url} data-action="community.profile" data-target={login} onClick={(e) => { e.preventDefault(); open(url); }}>{login}</a>
            </li>
          ))}
        </ul>
        {people.length > COLLAPSED && (
          <button type="button" className="btn sm comm-more" data-action="community.more" aria-expanded={all} onClick={() => setAll((v) => !v)}>
            {all ? t("收起") : t("显示全部 {n} 位", { n: people.length })}
          </button>
        )}
      </div>
    </div>
  );
}
