type Props = React.InputHTMLAttributes<HTMLInputElement>;

export default function Input(props: Props) {
  return (
    <input
      {...props}
      className={[
        "w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2",
        "text-white placeholder:text-white/40 outline-none",
        "focus:border-indigo-400/60 focus:ring-2 focus:ring-indigo-500/20 transition",
        props.className ?? "",
      ].join(" ")}
    />
  );
}
