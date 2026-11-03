so i used ai to generate a very quick prototype.

i can say the following things:

- the idea is feasible (as already demonstrated by google research)
- the number one enemy is slow generation of UI Commands (i guess, there is possible workarounds such as cached outputs on initial behavior, pre-prompting the agent on hover if it doesn't cost much)

**Notes on The Use Cases**:

It's not a good app for people who know exactly what they want. (those are better prompters)

It's a great app for people who don't know what they want exactly. (those we can give choices instead)

This is actually the optimal scenario, because the issue with AI adoption so far has been that Chat UI is a genuinely terrible UX for majority of people. What will they ask it? Most people start convos with "Hi, how are you?". We could have the same moat of social media apps, don't slap the user with a an input. Give him something to consume and build.

**Developed Idea**:

The developement of the idea I have is that the app should be something that gets built over use.

You know how social media algorithms start to "know" you and what you want. Exacltly, that but with UI that adapts over time to your preferences and use cases, and remember it.

You have CSV? Drag and drop it into the app, the app will show you what we can do with it based on its content... Everything will be possible!

**Developed Technical Architecture**:

The bottleneck is not in rendering. The biggest bottleneck is LLM time to first token. Streamed UI improves that significantly, however that's not enough.

For this version, we will remain with rendered HTML through a typescript library, similar to react work. We would have a sort of virtual dom, but not a really dom, it would have a different architecture to support atomic updates.

Client/Server VM architecture. We can do a lot in the browser, but for full power the app would need a server, think editing a video with FFMPEG. IN future this could be a locally run app, but now i'm buliding it as website.

The Client will be responsible for rendering the UI STATE and talking with the LLM generator.

The Server would hold the user state overtime as it changes. And somehow have VMs capable of running advanced code, possibly some sort of VM system with nix packages?
