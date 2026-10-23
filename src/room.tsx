import React, { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  Coins,
  Move,
  Palette,
  Save,
} from "lucide-react";
import { decorations } from "./domain";

type Position = { x: number; y: number; hidden?: boolean };
export type RoomLayout = { mood: string; positions: Record<string, Position> };
const defaults: Record<string, Position> = {
  flower: { x: 17, y: 90 },
  lantern: { x: 80, y: 82 },
  fountain: { x: 73, y: 97 },
};
const moods = [
  { id: "morning", name: "아침 햇살", icon: "☀️" },
  { id: "sunset", name: "분홍 노을", icon: "🌷" },
  { id: "night", name: "라벤더 밤", icon: "🌙" },
];
const fresh = (): RoomLayout => ({ mood: "morning", positions: {} });
const clamp = (n: number, low: number, high: number) =>
  Math.min(high, Math.max(low, n));
export function positionFor(layout: RoomLayout, id: string) {
  return layout.positions[id] || defaults[id] || { x: 50, y: 90 };
}
export function useRoomLayout(uid: string) {
  const readRoom = (owner: string): RoomLayout => {
    try {
      const data = JSON.parse(
        localStorage.getItem(`pray:room:${owner}`) || "null",
      );
      if (!data || !moods.some((m) => m.id === data.mood)) return fresh();
      const positions: Record<string, Position> = {};
      for (const item of decorations) {
        const p = data.positions?.[item.id];
        if (p && Number.isFinite(p.x) && Number.isFinite(p.y))
          positions[item.id] = {
            x: clamp(p.x, 13, 87),
            y: clamp(p.y, 40, 97),
            hidden: p.hidden === true,
          };
      }
      return { mood: data.mood, positions };
    } catch {
      return fresh();
    }
  };
  const [state, setState] = useState(() => ({
    owner: uid,
    layout: readRoom(uid),
  }));
  const layout = state.owner === uid ? state.layout : readRoom(uid);
  useEffect(() => {
    setState({ owner: uid, layout: readRoom(uid) });
  }, [uid]);
  function update(next: RoomLayout) {
    setState({ owner: uid, layout: next });
  }
  function persist() {
    localStorage.setItem(`pray:room:${uid}`, JSON.stringify(layout));
  }
  return { layout, update, persist };
}

export function RoomScene({
  owned,
  layout,
  editable = false,
  selected,
  onSelect,
  onMove,
}: {
  owned: string[];
  layout: RoomLayout;
  editable?: boolean;
  selected?: string;
  onSelect?: (id: string) => void;
  onMove?: (id: string, position: Position) => void;
}) {
  const scene = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; pointer: number } | null>(null);
  const move = (id: string, x: number, y: number) =>
    onMove?.(id, { x: clamp(x, 13, 87), y: clamp(y, 40, 97) });
  return (
    <div
      ref={scene}
      className={`room-scene mood-${layout.mood} ${editable ? "room-editable" : ""}`}
      aria-label={
        editable
          ? "소품을 옮겨 꾸미는 나의 방"
          : "토끼와 소망이의 포근한 기도 방"
      }
    >
      <img
        className="room-background"
        src={`${import.meta.env.BASE_URL}bunny-prayer-room.webp`}
        alt="분홍 헤드폰을 쓴 토끼가 소망이와 함께 햇살 드는 방에서 기도 일기를 쓰고 있어요"
        draggable={false}
      />
      <div className="room-atmosphere" aria-hidden="true" />
      <div className="room-note">
        지금도
        <br />
        충분히 잘하고 있어요!<span>♡</span>
      </div>
      {decorations
        .filter(
          (d) => owned.includes(d.id) && !positionFor(layout, d.id).hidden,
        )
        .map((d) => {
          const p = positionFor(layout, d.id);
          const sprite = (
            <img
              src={`${import.meta.env.BASE_URL}room-${d.id}.webp`}
              alt={editable ? "" : d.name}
              draggable={false}
            />
          );
          const style = {
            left: `${p.x}%`,
            top: `${p.y}%`,
            zIndex: Math.round(p.y),
          };
          return editable ? (
            <button
              key={d.id}
              className={`room-prop ${selected === d.id ? "chosen" : ""}`}
              style={style}
              aria-label={`${d.name} 위치 조정`}
              aria-pressed={selected === d.id}
              onClick={() => onSelect?.(d.id)}
              onPointerDown={(e) => {
                onSelect?.(d.id);
                drag.current = { id: d.id, pointer: e.pointerId };
                e.currentTarget.setPointerCapture(e.pointerId);
              }}
              onPointerMove={(e) => {
                if (
                  drag.current?.id !== d.id ||
                  drag.current.pointer !== e.pointerId ||
                  !scene.current
                )
                  return;
                const bounds = scene.current.getBoundingClientRect();
                move(
                  d.id,
                  ((e.clientX - bounds.left) / bounds.width) * 100,
                  ((e.clientY - bounds.top) / bounds.height) * 100,
                );
              }}
              onPointerUp={() => {
                drag.current = null;
              }}
              onPointerCancel={() => {
                drag.current = null;
              }}
              onKeyDown={(e) => {
                const changes: Record<string, [number, number]> = {
                  ArrowLeft: [-3, 0],
                  ArrowRight: [3, 0],
                  ArrowUp: [0, -3],
                  ArrowDown: [0, 3],
                };
                if (changes[e.key]) {
                  e.preventDefault();
                  const [x, y] = changes[e.key];
                  move(d.id, p.x + x, p.y + y);
                }
              }}
            >
              {sprite}
              <span className="prop-name">{d.name}</span>
            </button>
          ) : (
            <span key={d.id} className="room-prop" style={style}>
              {sprite}
            </span>
          );
        })}
    </div>
  );
}

export function RoomStudio({
  owned,
  coins,
  busy,
  connected,
  layout,
  update,
  persist,
  purchase,
  notify,
}: {
  owned: string[];
  coins: number;
  busy: boolean;
  connected: boolean;
  layout: RoomLayout;
  update: (layout: RoomLayout) => void;
  persist: () => void;
  purchase: (id: string) => Promise<void>;
  notify: (message: string) => void;
}) {
  const [category, setCategory] = useState("shop");
  const [selected, setSelected] = useState("");
  const selectedItem = decorations.find(
    (d) => d.id === selected && owned.includes(d.id),
  );
  function place(id: string, position: Position) {
    update({ ...layout, positions: { ...layout.positions, [id]: position } });
  }
  function nudge(x: number, y: number) {
    if (!selectedItem) return;
    const p = positionFor(layout, selected);
    place(selected, {
      ...p,
      x: clamp(p.x + x, 13, 87),
      y: clamp(p.y + y, 40, 97),
    });
  }
  return (
    <div className="room-studio">
      <section className="room-display panel">
        <div className="section-title">
          <div>
            <h2>🐰 나만의 포근한 방</h2>
            <p>작은 기도로 모은 선물, 내가 좋아하는 자리에.</p>
          </div>
          <span className="room-balance">
            <Coins size={16} />
            {coins} 코인
          </span>
        </div>
        <RoomScene
          owned={owned}
          layout={layout}
          editable
          selected={selected}
          onSelect={setSelected}
          onMove={place}
        />
        <div className="room-tools">
          <p>
            <Move size={15} />
            소품을 끌어 옮기거나, 선택 후 화살표로 조정해요.
          </p>
          <button
            className="primary"
            onClick={() => {
              try {
                persist();
                notify("나만의 방 꾸미기를 이 기기에 저장했어요 🐰");
              } catch {
                notify(
                  "기기 저장 공간을 확인해 주세요. 방 배치를 저장하지 못했어요.",
                );
              }
            }}
          >
            <Save size={16} />
            꾸미기 저장
          </button>
        </div>
        {selectedItem && !positionFor(layout, selected).hidden && (
          <div
            className="placement-controls"
            aria-label="선택한 소품 위치 조정"
          >
            <strong>{selectedItem.name}</strong>
            <div>
              <button aria-label="왼쪽으로 이동" onClick={() => nudge(-3, 0)}>
                <ArrowLeft size={18} />
              </button>
              <button aria-label="위로 이동" onClick={() => nudge(0, -3)}>
                <ArrowUp size={18} />
              </button>
              <button aria-label="아래로 이동" onClick={() => nudge(0, 3)}>
                <ArrowDown size={18} />
              </button>
              <button aria-label="오른쪽으로 이동" onClick={() => nudge(3, 0)}>
                <ArrowRight size={18} />
              </button>
            </div>
          </div>
        )}
      </section>
      <section className="room-shop panel">
        <div className="section-title">
          <div>
            <h2>🌷 소망이의 꾸미기 가게</h2>
            <p>기도·실천으로 모은 코인으로만 구매해요. 현금 결제는 없어요.</p>
          </div>
        </div>
        <div className="room-tabs" role="tablist" aria-label="방 꾸미기 분류">
          {[
            ["shop", "소품 가게"],
            ["owned", "내 보관함"],
            ["mood", "방 분위기"],
          ].map(([key, name]) => (
            <button
              key={key}
              role="tab"
              aria-selected={category === key}
              aria-controls={`room-panel-${key}`}
              onClick={() => setCategory(key)}
            >
              {name}
            </button>
          ))}
        </div>
        <div
          id={`room-panel-${category}`}
          role="tabpanel"
          aria-label={
            category === "mood"
              ? "방 분위기"
              : category === "owned"
                ? "내 보관함"
                : "소품 가게"
          }
        >
          {category === "mood" ? (
            <div className="mood-options">
              {moods.map((m) => (
                <button
                  key={m.id}
                  className={layout.mood === m.id ? "selected" : ""}
                  aria-pressed={layout.mood === m.id}
                  onClick={() => update({ ...layout, mood: m.id })}
                >
                  <span>{m.icon}</span>
                  {m.name}
                  <small>무료</small>
                </button>
              ))}
            </div>
          ) : (
            <>
              <div className="room-catalog">
                {decorations
                  .filter((d) => category === "shop" || owned.includes(d.id))
                  .map((d) => {
                    const has = owned.includes(d.id),
                      hidden = positionFor(layout, d.id).hidden;
                    return (
                      <article className="furniture-card" key={d.id}>
                        <div className="furniture-image">
                          <img
                            src={`${import.meta.env.BASE_URL}room-${d.id}.webp`}
                            alt={d.name}
                          />
                        </div>
                        <h3>{d.name}</h3>
                        <p>
                          {has ? (
                            <>
                              <Check size={13} />내 소품
                            </>
                          ) : (
                            <>
                              <Coins size={13} />
                              {d.cost} 코인
                            </>
                          )}
                        </p>
                        {has ? (
                          <button
                            className="secondary"
                            onClick={() => {
                              if (hidden) {
                                place(d.id, {
                                  ...positionFor(layout, d.id),
                                  hidden: false,
                                });
                                setSelected(d.id);
                              } else {
                                place(d.id, {
                                  ...positionFor(layout, d.id),
                                  hidden: true,
                                });
                                if (selected === d.id) setSelected("");
                              }
                            }}
                          >
                            {hidden ? "방에 배치" : "보관하기"}
                          </button>
                        ) : (
                          <button
                            className="primary"
                            disabled={busy || coins < d.cost}
                            onClick={() => purchase(d.id)}
                          >
                            {coins < d.cost
                              ? `${d.cost - coins} 코인 더 필요`
                              : `${d.cost} 코인으로 구매`}
                          </button>
                        )}
                      </article>
                    );
                  })}
              </div>
              {category === "owned" && !owned.length && (
                <div className="empty">
                  <span>🎁</span>
                  <h3>첫 소품을 기다리는 방이에요</h3>
                  <p>기도와 실천을 기록해 코인을 모아 보세요.</p>
                </div>
              )}
            </>
          )}
        </div>
        <p className="room-storage-note">
          {connected
            ? "구매한 소품과 코인은 계정에 저장돼요. "
            : "체험용 코인과 소품은 이 브라우저에 저장돼요. "}
          소품 위치와 방 분위기는 ‘꾸미기 저장’을 누르면 현재 기기에 저장돼요.
        </p>
      </section>
    </div>
  );
}
