# Alive v0 known issues

Issues found during the parser/schema review that are intentionally deferred for v0.

## 4. `in` is dropped on update

The spec lists `in` on every non-card kind, and `~` merges props. `parse.ts` lifts `in` only for create; update leaves it as a raw prop (`parser.test.ts` asserts this), but `schema.ts` omits `in` from `common` and `checkProps` drops it as an unknown prop. It also never validates the new parent id. Either model `in` structurally for update/reparent, or reject it explicitly.

## 5. `key=` removal is allowed on create

`+button b label=` parses to `create` with `{ label: null }`; the spec defines `key=` removal only for `~`. `checkProps` passes `null` through. Reject null props on create or define their meaning.

## 6. `checkProps` throws on an unknown kind

`schema.ts` does `kindDef(kind).props`, but `Op.kind` is typed as `KindName` and `checkProps` assumes it was validated. A caller that forwards an unknown kind will crash instead of receiving a rejection. The runtime must guard with `isKind`, or `checkProps` should accept `string` and return an issue.

## 9. `checkProps` drops invalid values for known props

`checkProps` silently drops invalid values for known props; the spec only promises dropping unknown props. Decide whether a bad value should drop the prop or reject the line.

## 10. Invalid prop names reject the whole line

`lex.ts` rejects non-lowercase or otherwise invalid prop names outright, so an unknown prop like `Label=x` rejects the whole line instead of being dropped as an unknown prop.
