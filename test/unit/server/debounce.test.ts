import { expect } from 'chai';
import { DebounceManager } from '../../../src/server/utils/debounce';

describe('DebounceManager', () => {
    let manager: DebounceManager;

    beforeEach(() => {
        manager = new DebounceManager(50); // 50ms for fast tests
    });

    afterEach(() => {
        manager.dispose();
    });

    it('should schedule and execute a callback after delay', (done) => {
        let called = false;
        manager.schedule('test', () => {
            called = true;
            expect(called).to.be.true;
            done();
        });

        expect(called).to.be.false;
    });

    it('should cancel a pending callback', (done) => {
        let called = false;
        manager.schedule('test', () => {
            called = true;
        });

        manager.cancel('test');
        expect(manager.isPending('test')).to.be.false;

        setTimeout(() => {
            expect(called).to.be.false;
            done();
        }, 100);
    });

    it('should replace previous callback on re-schedule', (done) => {
        let firstCalled = false;
        let secondCalled = false;

        manager.schedule('test', () => {
            firstCalled = true;
        });

        manager.schedule('test', () => {
            secondCalled = true;
        });

        setTimeout(() => {
            expect(firstCalled).to.be.false;
            expect(secondCalled).to.be.true;
            done();
        }, 100);
    });

    it('should report isPending correctly', () => {
        manager.schedule('test', () => { /* noop */ });
        expect(manager.isPending('test')).to.be.true;
        expect(manager.isPending('other')).to.be.false;
    });

    it('should cancelAll pending callbacks', (done) => {
        let count = 0;
        manager.schedule('a', () => { count++; });
        manager.schedule('b', () => { count++; });
        manager.schedule('c', () => { count++; });

        manager.cancelAll();

        setTimeout(() => {
            expect(count).to.equal(0);
            done();
        }, 100);
    });

    it('should dispose and cancel all timers', (done) => {
        let called = false;
        manager.schedule('test', () => {
            called = true;
        });

        manager.dispose();

        setTimeout(() => {
            expect(called).to.be.false;
            done();
        }, 100);
    });
});
