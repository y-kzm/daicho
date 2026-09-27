export function Toast({ msg, isError, show }: { msg: string; isError: boolean; show: boolean }) {
  return (
    <div id="toast" role="status" className={show ? 'show' + (isError ? ' error' : '') : ''}>
      {msg}
    </div>
  );
}
