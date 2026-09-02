"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./snake-game.module.css";

type Point = { x: number; y: number };
type Direction = "up" | "down" | "left" | "right";
type GameState = "idle" | "playing" | "paused" | "gameover";

const BOARD_SIZE = 20;
const INITIAL_SNAKE: Point[] = [
  { x: 10, y: 10 },
  { x: 9, y: 10 },
  { x: 8, y: 10 }
];
const DIRECTIONS: Record<Direction, Point> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 }
};
const OPPOSITE: Record<Direction, Direction> = {
  up: "down",
  down: "up",
  left: "right",
  right: "left"
};
const SPEEDS = [
  { label: "悠闲", ms: 170 },
  { label: "经典", ms: 120 },
  { label: "极速", ms: 78 }
];

function samePoint(a: Point, b: Point) {
  return a.x === b.x && a.y === b.y;
}

function createFood(snake: Point[]): Point {
  const free: Point[] = [];
  for (let y = 0; y < BOARD_SIZE; y += 1) {
    for (let x = 0; x < BOARD_SIZE; x += 1) {
      if (!snake.some((part) => part.x === x && part.y === y)) free.push({ x, y });
    }
  }
  return free[Math.floor(Math.random() * free.length)] ?? { x: 2, y: 2 };
}

function getStoredBest() {
  if (typeof window === "undefined") return 0;
  return Number(window.localStorage.getItem("neon-snake-best") ?? 0);
}

export default function SnakeGame() {
  const [snake, setSnake] = useState<Point[]>(INITIAL_SNAKE);
  const [food, setFood] = useState<Point>({ x: 14, y: 10 });
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [gameState, setGameState] = useState<GameState>("idle");
  const [justAte, setJustAte] = useState(false);
  const directionRef = useRef<Direction>("right");
  const queuedDirectionRef = useRef<Direction>("right");

  useEffect(() => setBest(getStoredBest()), []);

  const finishGame = useCallback((finalScore: number) => {
    setGameState("gameover");
    setBest((currentBest) => {
      const nextBest = Math.max(currentBest, finalScore);
      window.localStorage.setItem("neon-snake-best", String(nextBest));
      return nextBest;
    });
  }, []);

  const resetGame = useCallback(() => {
    directionRef.current = "right";
    queuedDirectionRef.current = "right";
    setSnake(INITIAL_SNAKE);
    setFood(createFood(INITIAL_SNAKE));
    setScore(0);
    setJustAte(false);
    setGameState("playing");
  }, []);

  const turn = useCallback((next: Direction) => {
    if (OPPOSITE[directionRef.current] === next) return;
    queuedDirectionRef.current = next;
  }, []);

  const toggleGame = useCallback(() => {
    if (gameState === "idle" || gameState === "gameover") {
      resetGame();
    } else if (gameState === "playing") {
      setGameState("paused");
    } else {
      setGameState("playing");
    }
  }, [gameState, resetGame]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const keyMap: Record<string, Direction | undefined> = {
        ArrowUp: "up",
        w: "up",
        W: "up",
        ArrowDown: "down",
        s: "down",
        S: "down",
        ArrowLeft: "left",
        a: "left",
        A: "left",
        ArrowRight: "right",
        d: "right",
        D: "right"
      };
      const next = keyMap[event.key];
      if (next) {
        event.preventDefault();
        if (gameState === "idle") resetGame();
        turn(next);
      }
      if (event.code === "Space") {
        event.preventDefault();
        toggleGame();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [gameState, resetGame, toggleGame, turn]);

  useEffect(() => {
    if (gameState !== "playing") return;
    const timer = window.setInterval(() => {
      setSnake((currentSnake) => {
        const nextDirection = queuedDirectionRef.current;
        if (OPPOSITE[directionRef.current] !== nextDirection) directionRef.current = nextDirection;
        const move = DIRECTIONS[directionRef.current];
        const head = currentSnake[0];
        const nextHead = { x: head.x + move.x, y: head.y + move.y };
        const hitWall = nextHead.x < 0 || nextHead.y < 0 || nextHead.x >= BOARD_SIZE || nextHead.y >= BOARD_SIZE;
        const ate = samePoint(nextHead, food);
        const bodyToCheck = ate ? currentSnake : currentSnake.slice(0, -1);
        const hitSelf = bodyToCheck.some((part) => samePoint(part, nextHead));
        if (hitWall || hitSelf) {
          finishGame(score);
          return currentSnake;
        }
        const nextSnake = [nextHead, ...currentSnake];
        if (ate) {
          const nextScore = score + 10;
          setScore(nextScore);
          setFood(createFood(nextSnake));
          setJustAte(true);
          window.setTimeout(() => setJustAte(false), 180);
          return nextSnake;
        }
        nextSnake.pop();
        return nextSnake;
      });
    }, SPEEDS[speed].ms);
    return () => window.clearInterval(timer);
  }, [finishGame, food, gameState, score, speed]);

  const statusText = gameState === "playing" ? "运行中" : gameState === "paused" ? "已暂停" : gameState === "gameover" ? "本局结束" : "等待开始";
  const actionText = gameState === "playing" ? "暂停" : gameState === "paused" ? "继续" : gameState === "gameover" ? "再来一局" : "开始游戏";

  return (
    <main className={styles.page}>
      <div className={styles.ambientOne} />
      <div className={styles.ambientTwo} />
      <section className={styles.shell}>
        <header className={styles.header}>
          <div className={styles.brand}>
            <span className={styles.logo} aria-hidden="true"><i /><i /><i /><i /></span>
            <div>
              <p>NEON ARCADE / 01</p>
              <h1>贪吃蛇</h1>
            </div>
          </div>
          <div className={styles.live}><span /> {statusText}</div>
        </header>

        <div className={styles.layout}>
          <aside className={styles.sidebar}>
            <section className={styles.scoreCard}>
              <p className={styles.eyebrow}>当前得分</p>
              <strong className={justAte ? styles.scorePop : ""}>{String(score).padStart(3, "0")}</strong>
              <div className={styles.divider} />
              <div className={styles.bestRow}><span>最佳纪录</span><b>{String(best).padStart(3, "0")}</b></div>
            </section>

            <section className={styles.controlCard}>
              <p className={styles.eyebrow}>速度模式</p>
              <div className={styles.speedOptions}>
                {SPEEDS.map((item, index) => (
                  <button key={item.label} className={speed === index ? styles.selected : ""} onClick={() => setSpeed(index)} aria-pressed={speed === index}>
                    <span>{index + 1}</span>{item.label}
                  </button>
                ))}
              </div>
            </section>

            <section className={styles.helpCard}>
              <p className={styles.eyebrow}>操作方式</p>
              <div className={styles.keyHelp}>
                <div className={styles.keys}><kbd>W</kbd><span /><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></div>
                <p>方向键或 WASD<br />空格键暂停游戏</p>
              </div>
            </section>
          </aside>

          <section className={styles.gameArea}>
            <div className={`${styles.boardFrame} ${gameState === "gameover" ? styles.boardDanger : ""}`}>
              <div className={styles.cornerTL} /><div className={styles.cornerTR} /><div className={styles.cornerBL} /><div className={styles.cornerBR} />
              <div className={styles.board} role="application" aria-label="贪吃蛇游戏棋盘">
                {Array.from({ length: BOARD_SIZE * BOARD_SIZE }, (_, index) => {
                  const point = { x: index % BOARD_SIZE, y: Math.floor(index / BOARD_SIZE) };
                  const snakeIndex = snake.findIndex((part) => samePoint(part, point));
                  const isFood = samePoint(food, point);
                  return <span key={index} className={`${styles.cell} ${snakeIndex === 0 ? styles.head : snakeIndex > 0 ? styles.body : ""} ${isFood ? styles.food : ""}`} />;
                })}
                {gameState !== "playing" && (
                  <div className={styles.overlay}>
                    <span>{gameState === "gameover" ? "SIGNAL LOST" : gameState === "paused" ? "SYSTEM PAUSED" : "READY PLAYER"}</span>
                    <h2>{gameState === "gameover" ? "游戏结束" : gameState === "paused" ? "暂停中" : "准备出发"}</h2>
                    <p>{gameState === "gameover" ? `最终得分 ${score}` : "吃掉能量核心，不要撞到边界与自己。"}</p>
                    <button onClick={toggleGame}>{actionText}<i>↗</i></button>
                  </div>
                )}
              </div>
            </div>

            <div className={styles.mobileControls} aria-label="触控方向键">
              <button onClick={() => turn("up")} aria-label="向上">↑</button>
              <div><button onClick={() => turn("left")} aria-label="向左">←</button><button onClick={() => turn("down")} aria-label="向下">↓</button><button onClick={() => turn("right")} aria-label="向右">→</button></div>
            </div>

            <div className={styles.actionBar}>
              <button className={styles.primary} onClick={toggleGame}><span>{gameState === "playing" ? "Ⅱ" : "▶"}</span>{actionText}</button>
              <button className={styles.restart} onClick={resetGame} aria-label="重新开始">↻</button>
              <div className={styles.progress}><span>LEVEL {speed + 1}</span><i><b style={{ width: `${((speed + 1) / 3) * 100}%` }} /></i></div>
            </div>
          </section>
        </div>
        <footer className={styles.footer}><span>GRID_20 × 20</span><span>© 2025 NEON LAB</span><span>BUILD 1.0.4</span></footer>
      </section>
    </main>
  );
}
