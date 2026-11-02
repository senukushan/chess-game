import { useCallback, useState } from "react";
import GameView from "./components/GameView";
import StartScreen from "./components/StartScreen";
import { sfx } from "./game/audio";
import type { Settings } from "./game/config";
import { loadSettings, saveSettings } from "./game/storage";

export default function App() {
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [screen, setScreen] = useState<"menu" | "game">("menu");
  const [session, setSession] = useState(0);

  const change = useCallback((s: Settings) => {
    setSettings(s);
    saveSettings(s);
  }, []);

  const play = useCallback(() => {
    sfx.unlock();
    sfx.click();
    setSettings((s) => {
      const fixed = { ...s, name: s.name.trim() || "PLAYER" };
      saveSettings(fixed);
      return fixed;
    });
    setSession((n) => n + 1);
    setScreen("game");
  }, []);

  const quit = useCallback(() => {
    sfx.click();
    setScreen("menu");
  }, []);

  return screen === "menu" ? (
    <StartScreen settings={settings} onChange={change} onPlay={play} />
  ) : (
    <GameView key={session} settings={{ ...settings, name: settings.name.trim() || "PLAYER" }} onQuit={quit} />
  );
}
