// Mock WebYOLO for the BotBlocks JS demo
export class WebYOLO {
    url: string | undefined;
    private _fakeBox = { x: 1.0, y: 0.5, w: 0.2, h: 0.2 };

    constructor(url?: string) {
        this.url = url;
    }

    find(label: string, _image: any) {
        if (label === 'hot dog') {
            this._fakeBox.x = 0.5 + (Math.random() - 0.5) * 0.2;
            return this._fakeBox;
        }
        return null; // Return null if nothing matched
    }
}
