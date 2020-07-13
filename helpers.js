export function groupByLength(array, joiner, maxLength) {
    const newArray = [array[0]];
    array.shift();
    for (let i = 0; i < array.length; i++) {
        const currentLength = newArray
            .map(content => content.length)
            .reduce((a, b) => a + b, 0);
        const element = array[i];
        if ((currentLength + element.length) > maxLength) {
            newArray.push(array);
        } else {
            const index = newArray.length - 1;
            const existingContent = newArray[index];
            newArray[index] = existingContent + joiner + element;
        }
    }
    return newArray;
}