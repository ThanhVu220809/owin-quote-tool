# GitHub Pages deployment

- In GitHub Settings → Pages, set Source to **GitHub Actions**.
- Set the Pages custom domain to `saigonfox.online`.
- In Namecheap, create a CNAME record with Host `@` and Value `thanhvu220809.github.io`.
- Add `https://saigonfox.online` as an Authorized JavaScript Origin in Google OAuth.
- IndexedDB data from the old domain does not move automatically to the new domain. Sign in with the same Google account and pull the Drive data into the new origin.

The workflow builds with `BASE_PATH=/` for the root custom domain. `VITE_SHARED_SECRET` is public in the JavaScript bundle and is only a temporary client-side value, not a real security secret.
