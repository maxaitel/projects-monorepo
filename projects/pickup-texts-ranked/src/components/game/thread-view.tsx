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
    <ol className="grid w-full gap-4" aria-label="Text thread">
      {messages.map((message) => {
        const isYou = message.side === "you";

        return (
          <li className={`flex ${isYou ? "justify-end" : "justify-start"}`} key={message.id}>
            <div
              className={`max-w-[85%] px-5 py-4 text-base font-medium shadow-md ${
                isYou
                  ? "rounded-2xl rounded-tr-sm bg-[var(--accent)] text-[var(--accent-fg)]"
                  : "bento-card-light rounded-2xl rounded-tl-sm"
              }`}
            >
              <p className="whitespace-pre-wrap break-words leading-relaxed">{message.body}</p>
              {message.badge ? (
                <span className={`mt-3 block w-fit rounded px-2 py-1 text-[10px] font-bold uppercase tracking-widest ${isYou ? "bg-black/20" : "bg-black/10"}`}>
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
