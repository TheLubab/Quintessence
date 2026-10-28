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
