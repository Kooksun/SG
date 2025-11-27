This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy to GitHub Pages

1. Push the project to GitHub (this repo is configured for `main`).
2. Make sure GitHub Pages is set to use the "GitHub Actions" source in the repository settings.
3. The included workflow `.github/workflows/deploy.yml` automatically builds with `npm run build && npm run export` and publishes the static site from the `out/` directory.
4. If you need to build locally, run `npm run deploy:pages` and serve the generated `out/` folder with any static file server.
