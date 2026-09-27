function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

export function validateReleaseEvent(event, release) {
  invariant(event && typeof event === "object" && !Array.isArray(event), "release event must be an object");
  invariant(event.schemaVersion === 1, "release event schemaVersion must be 1");
  invariant(event.releaseId === release.version, "release event releaseId does not match reviewed notes");
  invariant(
    event.channel === (release.channel === "prerelease" ? "preview" : "stable"),
    "release event channel does not match reviewed notes",
  );
  invariant(/^[0-9a-f]{40}$/.test(event.candidateSha), "release event candidateSha must be a full commit SHA");
  if (release.candidateSha) {
    invariant(event.candidateSha === release.candidateSha, "release event candidateSha does not match reviewed notes");
  }
  invariant(/^\d{4}-\d{2}-\d{2}T/.test(event.publishedAt), "release event publishedAt must be an ISO timestamp");
  invariant(event.releaseNotesUrl === `https://reasonix.io/changelog/v${release.version}/`, "release event URL is invalid");
  invariant(event.builds && typeof event.builds === "object", "release event builds are required");
  for (const surface of ["cli", "desktop", "npm"]) {
    invariant(typeof event.builds[surface] === "string" && event.builds[surface], `release event builds.${surface} is required`);
    if (release.builds?.[surface]) {
      invariant(event.builds[surface] === release.builds[surface], `release event builds.${surface} does not match reviewed notes`);
    }
  }
  return event;
}
