/* global Elm, mermaid */

console.log('script loaded')
mermaid.mermaidAPI.initialize({
    startOnLoad: false
})

//for tracking what is focused in accessible viewer for given graph
const focusMap = new Map();
// list of all Elm nodes ports for updating their local showHints setting
const updateShowHintsPorts = []; // elements are [string, port]

window.addEventListener("load", function () {

    const primaryHighlight = 'mermaid-access-highlight-primary';
    const secondaryHighlight = 'mermaid-access-highlight-secondary';
    const highlightFilter = (id, color) => `
    <filter id="${id}">
        <feDropShadow dx="0" dy="0"
        flood-color="${color}" />
    </filter>
    `
    const highlightFilters = `${highlightFilter(primaryHighlight, 'red')} ${highlightFilter(secondaryHighlight, 'cyan')}`

    //add live region for screen reader messages
    const accessibleOutputId = 'mermaid-access-live-output';
    let lastOutput = ""
    document.body.appendChild(document.createRange().createContextualFragment(`<div id="${accessibleOutputId}" aria-live="assertive"></div>`))

    document.querySelectorAll(".mermaid-access").forEach((element, index) => {
        const { textContent } = element
        element.textContent = "";
        const graphicDiv = document.createElement('div')
        const graphicId = 'mermaid-access-' + index;
        graphicDiv.setAttribute('id', graphicId)
        graphicDiv.setAttribute('aria-hidden', true)
        const accessDiv = document.createElement('div')

        const parseResult = mermaid.mermaidAPI.parse(textContent).parser.yy
        const graph = {
            nodes: parseResult.getVertices(),
            edges: parseResult.getEdges(),
            subgraphs: parseResult.getSubGraphs()
        }

        mermaid.mermaidAPI.render(graphicId, textContent, (svg) => {
            graphicDiv.innerHTML = svg
            // add highlight filter
            graphicDiv.querySelector('svg').innerHTML += highlightFilters;
        })
        element.appendChild(graphicDiv)
        element.appendChild(accessDiv)
        const app = Elm.Main.init({
            node: accessDiv,
            flags: {graph : graph, id : graphicId}
        })
        //add its showHints port to global list
        updateShowHintsPorts.push([graphicId, app.ports.updateLocalShowHints])
        //whenever local node updates its showHints setting, broadcast message to all other nodes
        app.ports.broadcastShowHints.subscribe(newShowHints => {
            updateShowHintsPorts.forEach(([appId, updatePort]) => {
                if (appId != graphicId)
                    updatePort.send(newShowHints)
            })
        })
        const convertToSelector = target => {
            if (target.type == 'node')
                return `[id^=flowchart-${target.id}-]`;
            else if (target.type == 'edge')
                return `#L-${target.start}-${target.end}`
            else if (target.type == 'root')
                return graphicId
        }

        //note : this could lead to bugs if same thing becomes both primary and secondary focus
        const unHighlight = type => {
            const prevFocusEntry = focusMap.get(graphicId)
            if (!prevFocusEntry) return;
            const prevFocus = prevFocusEntry[type]
            if (!prevFocus) return;
            graphicDiv.querySelector('#' + prevFocus.id).setAttribute('style', prevFocus.style)
            focusMap.set(graphicId, { ...prevFocusEntry, [type]: undefined })
        }

        const highlight = (type, target) => {
            unHighlight(type)
            // if target is null, signalling to just unhighlight, so work done
            if (target === null) return;
            //don't highlight if root
            if (target.type == 'root') return;
            // cant figure out style that works correctly for edges, so skip those
            if (target.type == 'edge') return;

            const selector = convertToSelector(target)
            const toHighlight = graphicDiv.querySelector(selector)
            if (toHighlight) {
                const prevEntry = focusMap.get(graphicId) || {}
                focusMap.set(graphicId, { ...prevEntry, [type]: { id: toHighlight.id, style: toHighlight.getAttribute('style') } })
                toHighlight.setAttribute('style', `${toHighlight.getAttribute('style') || ""}filter:url(#${(type == 'primary') ? primaryHighlight : secondaryHighlight});`)
            } else
                console.log(`Tried to highlight ${target}, with "${selector}" selector, in ${graphicId}, but couldn't find a corresponding element.`)

        }

        app.ports.focusChanged.subscribe(message => {
            console.log(message)
            const primary = 'primary'
            const secondary = 'secondary'
            //be careful to do exact comparisn for undefined, since null singals loss of focus
            // also order of secondary then primary is important for unhighlighting
            if (message[secondary] !== undefined)
                highlight(secondary, message[secondary])
            if (message[primary] !== undefined)
                highlight(primary, message[primary])
        })
        app.ports.output.subscribe(outStr => {
            if (lastOutput == outStr) return;
            lastOutput = outStr;
            const outputArea = document.getElementById(accessibleOutputId)
            outputArea.innerHTML = outStr;
            //after short delay, clear global output area
            window.setTimeout(() => {
                outputArea.innerHTML = ""
            }, 200)
        })
    });
})