# Chess Game ♟️

A chess game project built with TypeScript and Vite.

## Requirements

- [Node.js](https://nodejs.org/) and npm

## Getting Started

1. Clone the repository and open the project folder:

   ```bash
   git clone <your-repository-url>
   cd chess-game
   ```

2. Install the dependencies:

   ```bash
   npm install
   ```

3. Start the development server:

   ```bash
   npm run dev
   ```

4. Open the local URL shown in the terminal in your browser.

### Running in GitHub Codespaces

Run the development server so that Codespaces can forward its port:

```bash
npm run dev -- --host 0.0.0.0
```

When prompted, select **Open in Browser**. You can also open the forwarded port from the **Ports** tab.

## Project Structure

```text
chess-game/
├── src/               # Application source code
├── index.html         # Main HTML file
├── package.json       # Project scripts and dependencies
├── package-lock.json  # Locked dependency versions
├── tsconfig.json      # TypeScript configuration
├── vite.config.ts     # Vite configuration
└── README.md
```

## Build for Production

If a `build` script is defined in `package.json`, run:

```bash
npm run build
```
