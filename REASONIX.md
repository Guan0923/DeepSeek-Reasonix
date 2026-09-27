# Reasonix Website instructions

- This branch owns the public website and public documentation portal only.
  Do not add product client or backend service code here.
- Keep production publication manually triggered and restricted to `website`.
- Preserve accessibility, responsive layout, and static-build compatibility.
- Authentication and marketplace pages call versioned `platform` APIs; they do
  not duplicate account or registry business logic.
- Add tests for user-visible contracts and run a production build before release.
- Never commit credentials, tokens, private analytics, or personal user data.
- Comments are English and explain only non-obvious constraints.
