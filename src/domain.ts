export type Kind = "prayer" | "task";
export type Comment = { id: string; name: string; text: string; at: number };
export type Entry = {
  id: string;
  title: string;
  body: string;
  kind: Kind;
  secret: boolean;
  author: string;
  authorName: string;
  count: number;
  myCount: number;
  createdAt: number;
  lastLog?: number;
  rating?: number;
  completedAt?: number;
  comments: Comment[];
  source?: string;
};
export type Person = {
  uid: string;
  name: string;
  parentUid?: string;
  role: string;
};
export type Profile = {
  uid: string;
  name: string;
  xp: number;
  coins: number;
  decorations?: string[];
};
export const decorations = [
  { id: "flower", name: "작은 꽃밭", icon: "🌷", cost: 20 },
  { id: "lantern", name: "별빛 랜턴", icon: "🏮", cost: 50 },
  { id: "fountain", name: "소망의 분수", icon: "⛲", cost: 100 },
];
export const ratings = [
  "아직 기다리는 중",
  "작은 변화가 있어요",
  "절반쯤 이루어졌어요",
  "거의 이루어졌어요",
  "감사해요, 이루어졌어요",
];
export const percent = (rating: number) => (rating - 1) * 25;
export function stats(items: Entry[]) {
  const done = items.filter((x) => x.rating != null);
  const answered = done.filter((x) => x.rating === 5);
  return {
    done: done.length,
    answered: answered.length,
    average: answered.length
      ? Math.round(
          (answered.reduce((n, x) => n + x.count, 0) / answered.length) * 10,
        ) / 10
      : null,
    feeling: done.length
      ? Math.round(
          done.reduce((n, x) => n + percent(x.rating!), 0) / done.length,
        )
      : null,
  };
}
export function logEntry(e: Entry, now = Date.now()): Entry {
  if (e.rating != null) throw Error("이미 마무리한 기록이에요.");
  if (e.lastLog && now - e.lastLog < 3000)
    throw Error("잠깐 숨을 고르고 다시 기록해 주세요.");
  return { ...e, count: e.count + 1, myCount: e.myCount + 1, lastLog: now };
}
export function finishEntry(e: Entry, rating: number, now = Date.now()): Entry {
  if (e.rating != null) throw Error("이미 마무리한 기록이에요.");
  if (!Number.isInteger(rating) || rating < 1 || rating > 5)
    throw Error("1~5단계를 선택해 주세요.");
  return { ...e, rating, completedAt: now };
}
const yesterday = Date.now() - 86400000;
export const demoItems: Entry[] = [
  {
    id: "welcome1",
    title: "우리 가족이 평안한 하루를 보내도록",
    body: "바쁜 일상 속에서도 서로의 마음을 살피고, 따뜻한 말을 건네는 가족이 되게 해 주세요.",
    kind: "prayer",
    secret: false,
    author: "leader",
    authorName: "은혜 팀장",
    count: 12,
    myCount: 0,
    createdAt: yesterday,
    comments: [
      {
        id: "c1",
        name: "하은",
        text: "오늘 엄마와 오랜만에 마음을 나눴어요. 작은 변화가 감사해요 🌷",
        at: yesterday,
      },
    ],
    source: "팀장에게서 왔어요",
  },
  {
    id: "welcome2",
    title: "새로운 시작 앞에 용기를 주세요",
    body: "결과보다 오늘 할 수 있는 한 걸음에 집중할 수 있도록 함께 기도해 주세요.",
    kind: "prayer",
    secret: false,
    author: "demo",
    authorName: "나",
    count: 7,
    myCount: 2,
    createdAt: yesterday,
    comments: [],
  },
  {
    id: "welcome3",
    title: "고마운 사람에게 안부 전하기",
    body: "마음에 떠오르는 한 사람에게 짧은 안부와 감사의 말을 전해 보아요.",
    kind: "task",
    secret: false,
    author: "leader",
    authorName: "은혜 팀장",
    count: 3,
    myCount: 0,
    createdAt: yesterday,
    comments: [],
    source: "팀장에게서 왔어요",
  },
  {
    id: "welcome4",
    title: "잠들기 전 감사 세 가지 적기",
    body: "아주 작은 일도 괜찮아요. 오늘의 감사 세 가지를 기록해요.",
    kind: "task",
    secret: false,
    author: "demo",
    authorName: "나",
    count: 2,
    myCount: 2,
    createdAt: yesterday,
    comments: [],
  },
];
