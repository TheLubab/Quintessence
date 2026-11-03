i've been heavily experimenting with the idea of reinventing UI.

my approach so far has been a failure, as i've been blinded by focusing too much on the graphical side, i turning UI into a graph, which is a definetly thing we should explore.

However, the biggest mistake was focusing too much on the visual side of things and mixing it with the core logic. I've been comparing "adapt" to "react", and that led me in a bad circle of reinventing react but for canvas lol.

But now I come a new realization, adapt should not be driven by visual propreties, but visual propreties are a side effect.

Adapt should model **what exists**, **what can happen to it**, and **what currently matters to the user**. The Interface only comunicates that model properly.

That gives Adapt 3 distinct concerns:

- **Content**: Things, their data, identity, relationships
- **Capabilities**: Available actions
- **Attention**: The current focused subject, active scope, and relevant surrounding context

This models how humans process data, one at time.

Once we have an abstract model, then we can create interfaces for displaying and interacting with such models.

For example, in display we would use a Canvas UI with smooth animations and gestures. Or we go in a completely different direction, and we attach adapt to a Voice Interface where the user can instruct adapt to put a thing on focus, then instruct it.

Things in adapt are operable and mounted, even when no visual representation is mounted.

In short, that means the foundation of Adapt is that it should let someone:

1. Create and inspect things.
2. Describe and discover their capabilities.
3. Invoke operations and observe changes.
4. Establish attention and context.

Or in short Adapt is made up of 4 concepts: Things, Actions, Attention, Representation (how those things are comunicated)

Things are data. Actions change them. Sessions hold attention. Interfaces express the result.

Some design decisions:

- Things exist independently of presentation.
- Sessions own local attention.
- Storage and assets use adapters.
- Authentication is supplied by the application.
- Heavy work that takes time should not block execution and should update state to loading.
- No complexity.

it's important to remember, that canvas or even visual is one way of interaction, adapt is a HCI model after all. It tries to be very intuitive by working in accordance to human neurology, that's where the idea of one focused thing come from.

I would imagine there would be many presenters.

For example, one that is audio only. Or even maybe canvas one would have an audio control plugin.

I would also like to imagine, it would be part of AR Glasses, maybe smart watches. Idk what but possiblities infinite.

A good example I thought of is doctors, imagine a doctor for himself and peers would present his report in details, but with one command it become a simplified version for his patients, where they would also have different actions, like ask for clarification or so.

After few thougths about the implementation, i think it's important to split one thing that is bothering me.

- **capabilities**: something that user can do to the thing, for example delete. or edit with AI. or whatever. it's a code that runs in the server, and actually modifies the thing.

- **suggestions**: having a capability doesn't make it always appropriate thing for the user to do, this where AI power will matter alot, instead of displaying all capabilities, the trick is to suggest only relevent ones ranked by an AI. For example instead of edit with AI, we could have a suggestion "brighten the image".

How would that look with different prenestations:

- Canvas/Web: Managemnet tools on the side. Recommended edits near the thing.
- Audio: "You can edit or share this photo. One suggestion is to brighten the shadows."
- Watch: One relevent suggestion, with access to other available operations
- AR: A contextual suggestion near the subject

Suggestions would have categories I would believe that would help with presentation, for example "management, editing", they describe category rather than prsentation. tHe presenter responsiblities is to do it appropriately.

But also relevance is not the only important thing to a human mind. Human minds love predictability, therefore familiar tools should remain easy to find and stable.

A capability makes something possible. A suggestion makes that possibility available to the person in a particular context.

I noticed a limitation with the current architecture and direction. Users don't need everything to be persistent. Many things should be temporary!!! But current architecture treated everything as permanent (i guess except actions).

For example , if user is exploring the web. Why would we store everything we fetch.
