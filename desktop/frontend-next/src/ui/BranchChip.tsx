import { useId } from "react";
import { t } from "../i18n";
import type { WorkspaceGit } from "../port/port";
import { StudioIcon } from "./StudioIcon";

interface Props {
  // The work tree's git answer (/workspace/git), refreshed on the pane's tree
  // path. null is "not answered yet" and renders nothing; repo:false renders
  // a chip that says so — three states that must not read as one word.
  git: WorkspaceGit | null;
  changeCount: number;
}

// The composer's branch chip: the workspace's branch as git itself names it.
// A detached HEAD names its short SHA; a workspace with no repository keeps a
// muted chip that says so instead of vanishing.
export function BranchChip({ git, changeCount }: Props) {
  const branchTipId = useId();
  if (git && !git.repo) {
    return (
      <div className="studio-branch-pop">
        <div className="mode plain studio-branch" data-norepo="" tabIndex={0} aria-describedby={branchTipId}>
          <span className="ic" aria-hidden="true"><StudioIcon name="branch" /></span>
          <span className="lb">{t("非 Git 仓库")}</span>
        </div>
        <div className="studio-branch-card" id={branchTipId} role="tooltip">
          <b>{t("此工作区未受版本控制")}</b>
          <span>{t("这里没有 Git 仓库，因此没有分支可显示或切换")}</span>
        </div>
      </div>
    );
  }
  if (!git?.repo) return null;
  return (
    <div className="studio-branch-pop">
      <div
        className="mode plain studio-branch"
        tabIndex={0}
        aria-label={t("当前 Git 分支：{branch}", { branch: git.branch })}
        aria-describedby={branchTipId}
      >
        <span className="ic" aria-hidden="true"><StudioIcon name="branch" /></span>
        <span className="lb">{git.branch}</span>
        {changeCount > 0 && <small>{t("{n} 个变更", { n: changeCount })}</small>}
      </div>
      <div className="studio-branch-card" id={branchTipId} role="tooltip">
        <b>{git.detached ? t("HEAD 分离 · {sha}", { sha: git.branch }) : t("当前分支 · {branch}", { branch: git.branch })}</b>
        <span>{changeCount > 0 ? t("当前工作区 · {n} 个本地变更", { n: changeCount }) : t("当前工作区 · 后续任务继续使用此分支")}</span>
        <small>{t("随回合与写入刷新 · 非实时")}</small>
      </div>
    </div>
  );
}
