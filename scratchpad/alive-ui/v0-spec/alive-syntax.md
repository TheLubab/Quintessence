# Alive v0

A line-based language an LLM uses to build and change a UI. One line is one complete action, applied the moment it finishes streaming.

Strings are always literal. The schema (kinds, props, events) is the source of truth. The parser, validator, and model prompt are generated from it.

## Pipeline

```
model text -> parser -> typed Op -> runtime validates -> op log -> patches -> renderer
```

- The parser only turns text into typed ops.
- The runtime is the authority. It accepts or rejects each op.
- The renderer receives validated patches and never sees Alive text.

## Statements

The first character is the operation.

```
+kind id props...                      create, or replace props if id exists
~id props...                           update props (merge)
-id                                    delete node and its subtree
>id in=ID [before=ID | after=ID]       move or reorder
+on ID EVENT -> prompt "intent"        create or replace rule
-on ID EVENT                           delete rule
```

- No aliases. Blank lines, comment lines starting with `#`, and code fence lines are ignored.
- `on` is reserved and cannot be an id.

## Identity

- Ids match `[a-z][a-z0-9_.-]*` and are stable. Dots are cosmetic.
- The parent is set only by `in=`. Top-level cards omit it.
- Order is creation order. Use `before=` or `after=` to place a node.
- The parent must already exist. Otherwise the line is rejected.
- `+` is upsert. A new id creates a node. An existing id with the same kind replaces all its props, keeping its children, rules, and position; props not named are removed. A different kind or parent is rejected. Use `~` to merge props, or `-` then `+` to replace the node and subtree.
- `~` merges props. `key=` with no value removes the prop.
- `+on` attaches a rule to that specific node and replaces an existing rule for the same event.
- Deleting a node deletes its rules.

## Values

| Form    | Example                  | Notes                                                                                                                                                                |
| ------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| word    | `main` `2` `true` `none` | no whitespace or quotes                                                                                                                                              |
| string  | `"New note"`             | single line. Escapes: `\"` `\\` `\n` only                                                                                                                            |
| heredoc | `content=<<END`          | must be the last token on the line. Body is literal and runs until a line that is `END` plus optional trailing whitespace. The tag is `[A-Z_]+`, chosen by the model |

```
+text article.body in=article content=<<END
Any "messy" text, {braces}, $dollars, code:
  if (x) { y }
END
```

A heredoc statement commits only when its terminator arrives. While it streams, the renderer may show the partial text as a provisional preview. If the stream ends first, the statement is discarded and reported as an error.

## Kinds and props

| Kind     | Props                                |
| -------- | ------------------------------------ |
| `card`   | `title` `layer`(ground/main/overlay) |
| `group`  | `layout`(stack/row/grid)             |
| `text`   | `content` `level`(1-3)               |
| `button` | `label` `icon`                       |
| `input`  | `placeholder` `value`                |
| `image`  | `src` `alt`                          |

Props on every kind except `card`: `in` `attention`(1-3) `density`(compact/comfortable) `mode`(editorial/focus).

Props state intent. Never describe visual styling.

## Rules

```
+on explore.submit submit -> prompt "Explore the submitted topic"
```

- Events: `click` (any node) and `submit` (input, on Enter).
- `prompt` sends the intent text, plus context, to the model.
- A rule's identity is `ID + EVENT`. `+on` replaces the existing rule for that event.
- Built-in behavior never needs a rule: typing in inputs, focus, scroll, button press feedback.

## Runtime state

- Input values live in the runtime. The model can set an initial `value`, but it never has to track typing.
- No model-visible state, expressions, or bindings in v0.

## What the model receives

```
STATE
<the focused card in full, other cards as one-line gists>
ERRORS
<rejected lines from the previous turn, if any>
EVENT
click explore.submit
PROMPT
Explore the submitted topic
INPUTS
explore.query = "quantum computing"
```

`INPUTS` holds the current values of every input in the card that fired the event.

## Errors

- A bad line is rejected alone. The rest still apply.
- An unknown prop is dropped. The rest of the line applies.
- `~` `-` `>` on an unknown id is an error, never a silent no-op.
- Rejected lines return on the next turn as `ERROR <line> :: <reason>`.

## Example

```
+card home layer=main title="Alive"
+group home.actions in=home layout=stack
+button home.explore in=home.actions label="Explore"
+button home.make in=home.actions label="Make"
+on home.explore click -> prompt "Open an exploration interface"
```

After the click, the model replies:

```
-card home
+card explore layer=main title="Explore"
+text explore.title in=explore attention=2 content="What interests you?"
+input explore.query in=explore placeholder="Search or enter a topic"
+button explore.go in=explore label="Discover"
+on explore.go click -> prompt "Explore the submitted topic"
```

## Future ideas (not implemented)

- Expressions, bindings, and model-visible state.
- `things()` queries. For now the server returns concrete content and the model writes it into nodes.
- Lists and row templates. For now repeat nodes.
- `send` and cross-card messaging.
- Local actions (`set`, `toggle`, `open`, `close`).
- Out-of-order children.
- Node revisions and stale-edit checks.
- Grouped multi-op updates.
- Aliases and a human-facing syntax.
