/** 業務エラー。message はそのままユーザーに表示される日本語文。 */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly status: number = 400,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function notFound(what: string): AppError {
  return new AppError(`${what}が見つかりません。再読み込みしてからやり直してください。`, 404);
}
