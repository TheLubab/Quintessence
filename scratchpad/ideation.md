

## Ideas

**My Criterias**:

- No generic chat interfaces (chatbots are boring and overdone).
- No competing with VC-backed startups (Tavily/Exa have too much data infra).
- High, undeniable real-world utility (no gimmicky "life loggers" or toys).
- Feasible without needing months of training data or complex hardware.

### Search Engine For AI

**Existing Platforms**:
- tinyfish.ai: gives AI ability to browse web.
- exa.ai: Library of crawled web data (people, companies, jobs, weather, sports, places, finances, commerce, events, wikipedia, research papers, patents, etc...)
- exa.ai: web search API.
- exa.ai: monitor web changes and other agentic ways to browse the web.
- tavily.com: API for search, browsing, extraction, research, crawling, mapping, etc.
- parallel.ai: web infra for AI to search, browse, extract, monitor the web.
- brave.com search api: pagerank search for web data (answers, images, videos, news, web, etc.)
- you.com: structured data for AI like brave.
- Onyx.app: open source infra to connect your enterprise knowledge to give you accuaret information
- firecrawl: open source standard for turning web into markdown or json
- searchxng: open source meta-search engine that aggregates results from 70 search services and databases


**conclusion**: REJECTED

**reason**: Very powerful competitor, unless i take a completely different approach, it will 100% fail. 


### E-Commerce Product layer

The issue with asking AI for products suggestions, is that i'ts always very generic, and basically useless.

The idea is to solve that through a product data layer, that offers more rich data, interactive colors/sizes, good pictures, etc.. and possibly instant checkout.

The issue is that it's hard to acquire live accurate data, best way to let merchant willingly give our app access to their data, and in exchange they get featured. But that takes times and trust and reasons, the chicken and egg problem.


**conclusion**: DOWN
**reason**: the hackathon seem to care more about new creative innovative ideas unseen before with great execution, over generic ideas.



### Science Guide

Democratize Science. An AI that have to access to real engineering papers, scentific papres, etc.. 

And it turns it into step-by-step guides to implement in real life.

For example, I want to build a drone, i ask the AI. It looks up the science. 


It gives me exactly, what I need. Then steps to build it with wireframes.


Possibly even allow more complex scentific builds.

Remember there was a popular person who bulid like 40 big machines and made them open source, to be used in farming and manufcturing. Maybe something like that made accessible more.


**conclusion**: REJECTED
**reason**: The issue is that the idea is basically a typical ui chat interface, nothing interesting about it. And the biggest issue remains, that the issue in engineering is debuging real world live, a model attached to camera is hardly doing anything.



### Full Privacy Real World Memory

Imagine glasses or phone or whatever, a data feed. But instead of storing videos/images, it stores understanding. E.g person done X now, used computer from 10 -> 12,  went to bathroom, talked with hana, promised her to do laundry...

The video feed gets immediately transformed into text data by time. 

User can look it up and see exactly what happened without watching or storing a video, just the text.

Biggest issue with this is privacy, solution would be completely local models. Which is the biggest issues, since good vision models can't run in small devices and using a hosting provider defeats the purpose unless encrypted which is still a trust issue. Maybe running in user local powerful machines and connects to devices with client/server.  I have no idea if the vision models would work in users big machines.


Second issue is why the fuck would anyone want that? I personally would never use such a thing. It's just stupid.

But a point can be made for people with bad memory or management issues, i don't represent all people.

**conclusion**: DOWN
**reason**: Not sure about this since it's not even that creative, it's too problamatic.




### Agentic VPS

The goal is to lower cost of hosting. Instead of serverless and other second layer hosting. We do the opposite.


Basically, a VPS with an agent alive inside, the agent is basically the keeper of the VPS. It runs all the time, watching logs, errors, attacks, etc.. ANd fixing them.

But the agent itself turns into the risk of making mistakes. So we need a system that prevents the mistakes from being catastrophic.


Possibly use a declarative system like NixOS, that can't be bypassed by the agent. And the declarative system itself is the proof, with a possible inteface for the dev to view the system declaration, and can override.


How the agent would work is basically, you talk with it, show it your project for example a github repo, and ask it to open it to the world. It does whatever it needs to like, use docker compose to orchestrate containers for it, maybe for the postgres and the fullstack app, and open it and such. 


Not sure if the idea is doable, not sure if the idea is even good to exist.


**conclusion**: UP

**reason**: Potential use case and unexplored teriroty with nixos which already exist as foundation



### Alive UI

Currently we still use web browsers and normal UI to browse the web even with agents. 

When using AI, you are always met with a chat interface that can display rich data, or even render html for you.


The idea is to build a new innovative UX never seen before. 


The current execution idea is to invent a new very very fast way for AI to generate interfaces instantly instead of the bloated HTML. This would include creating a new interface language to compete with HTML, that is extremely minimal with least tokens possible, and very powerufl for the UI, with gurantees to always look good.


How the UX will be used is still unclear and im not sure how. I imagine something with webgl and opengl and low over head graphics. The user enters and is met with buttons to begin the "browsing". Once the user shows intention, instead of AI responsding with text it responds with UI. 


We somehow need a way to get the user intention from few clicks to lower the need to type manually. Think of how Tiktok and algorithms don't ask user waht you want, but just study him. 


**Existing Platforms**:

- A2UI.org: currently seem to be primitive, hardly usable, and targeted for devs. But same core idea of safe Agent to User. With things like renderer. My observation is that this is relient on standard rigid UI already used in web, my idea was trying to actually change that UI (not sure how yet). A2UI uses json, https://a2ui-project.github.io/composer/
- ag-ui.com: same attempt as A2UI
- openui.com: another attempt but less rigid, it creates full layouts of components live, and it's very fast. they even have a model trained on it. it's more similar to what i want. but also seem to be more rigid than what i was imagining and rely on chat. Nobody tried to make it fluid like i imagine maybe it's impossible. openui is more like integrated in chat with agent, similar to what chatgpt already does. But they also created AppLess which uses openui underneath, to do a similar thing to what i want.


**conclusion**: UP
**reason**: Even google is attempting this which validate the potential of the idea. Current competitors are taking different approach and none are dominant giving me a possible place for entry if i execute differently instead of folliwng their same approach.



### Hands-Free Computer

Eye tracking + voice commands and hums.

Control computer with your eyes and microexpressions.

Your eyes selects area.

Tiny movements or hamming opens it.

Big commands to control computer, e.g. Open my email. Reply and type with voice. Send with your eyes.

Combination between micro control (move mouses and click with face) and macro control (tell ai what  to do for harder tasks)
