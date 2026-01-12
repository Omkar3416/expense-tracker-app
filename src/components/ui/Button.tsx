type Props = React.ButtonHTMLAttributes<HTMLButtonElement>;

export default function Button({ className = "", ...props }: Props) {
  return (
    <button
      {...props}
      className={[
        "rounded-xl px-4 py-2 font-semibold transition",
        "bg-gradient-to-r from-indigo-500 via-fuchsia-500 to-cyan-400",
        "text-black shadow-lg shadow-indigo-500/25 hover:opacity-90",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        className,
      ].join(" ")}
    />
  );
}
