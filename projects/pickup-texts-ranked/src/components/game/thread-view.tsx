type ThreadMessage = {
  id: string;
  side: "you" | "them";
  body: string;
  badge?: string;
};

type ThreadViewProps = {
  messages: ThreadMessage[];
};

export function ThreadView({ messages }: ThreadViewProps) {
  return (
    <ol className="grid w-full gap-2" aria-label="Text thread">
      {messages.map((message) => {
        const isYou = message.side === "you";

        return (
          <li className={`flex ${isYou ? "justify-end" : "justify-start"}`} key={message.id}>
            <div
              className={`max-w-[82%] rounded-lg px-3 py-2 text-sm leading-5 shadow-sm ${
                isYou
                  ? "bg-cyan-400 text-zinc-950"
                  : "border border-zinc-800 bg-zinc-900 text-zinc-100"
              }`}
            >
              <p className="whitespace-pre-wrap break-words">{message.body}</p>
              {message.badge ? (
                <span className="mt-2 inline-flex rounded-sm bg-zinc-950/15 px-2 py-0.5 text-xs font-semibold">
                  {message.badge}
                </span>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
