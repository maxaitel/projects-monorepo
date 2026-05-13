export interface StarterPrompt {
  id: string;
  sender: "them" | "you";
  text: string;
}

export const STARTER_PROMPTS: StarterPrompt[] = [
  { id: "wyd-tonight", sender: "them", text: "lol what are you doing tonight?" },
  { id: "coffee-order", sender: "them", text: "you remembered my coffee order??" },
  { id: "two-am", sender: "them", text: "why are you texting me at 2am" },
  { id: "wrong-number", sender: "them", text: "new phone who is this" },
  { id: "easter-shift", sender: "them", text: "happy easter, does wednesday at 7 work?" },
  { id: "grocery-aisle", sender: "them", text: "what's your favorite aisle in the grocery store?" },
];
