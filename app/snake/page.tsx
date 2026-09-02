import type { Metadata } from "next";
import SnakeGame from "../../components/snake-game";

export const metadata: Metadata = {
  title: "Snake — Neon Arcade",
  description: "一款支持键盘、触控与多档速度的霓虹贪吃蛇游戏。"
};

export default function SnakePage() {
  return <SnakeGame />;
}
