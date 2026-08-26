/**
 * Minimal `classnames`-style helper: joins truthy arguments with a space.
 * Kept local instead of pulling in the `classnames` package for one tiny use.
 *
 * @param {...(string|false|null|undefined)} args Class names / falsy values to skip.
 * @return {string} Space-joined class list.
 */
export default function classnames( ...args ) {
	return args.filter( Boolean ).join( ' ' );
}
