export function create (max) {
    let ticks = 0;
    return {
        tick: (progress, by = 1) => ticks += by,
        draw: (label = '', chars = 40) => {
            const numCompleted = Math.ceil(ticks / max * (chars - 2));
            const progressCompleted = char('=', numCompleted);
            const progressToBe = char(' ', chars - 2 - numCompleted);
            const percentage = Math.ceil(ticks / max * 100);
            return `\`[${progressCompleted + progressToBe}] ${percentage}% ${label}\``;
        }
    }
}
  
function char (str, times) {
    return Array(times + 1).join(str);
}