"use client";

import { useMantineColorScheme } from "@mantine/core";
import { useMounted } from "@mantine/hooks";
import { Icon, type IconName } from "./Icon";
import styles from "./ThemeSwitch.module.css";

const CHOICES: { value: "auto" | "light" | "dark"; label: string; icon: IconName }[] = [
  { value: "auto", label: "Match my device", icon: "monitor" },
  { value: "light", label: "Light", icon: "sun" },
  { value: "dark", label: "Dark", icon: "moon" },
];

/** Light, dark, or match the device. The choice is remembered in this browser. */
export function ThemeSwitch() {
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const mounted = useMounted(); // the saved choice is only known in the browser
  return (
    <div className={styles.group} role="radiogroup" aria-label="Theme">
      {CHOICES.map((c) => (
        <button key={c.value} type="button" role="radio" aria-checked={mounted && colorScheme === c.value} className={styles.opt} onClick={() => setColorScheme(c.value)} title={c.label}>
          <Icon name={c.icon} />
          <span>{c.label}</span>
        </button>
      ))}
    </div>
  );
}
