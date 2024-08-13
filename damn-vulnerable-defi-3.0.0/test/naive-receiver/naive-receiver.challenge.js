const { ethers } = require('hardhat');
const { expect } = require('chai');

describe('[Challenge] Naive receiver', function () {
    let deployer, user, player;
    let pool, receiver;

    // Pool has 1000 ETH in balance
    const ETHER_IN_POOL = 1000n * 10n ** 18n;

    // Receiver has 10 ETH in balance
    const ETHER_IN_RECEIVER = 10n * 10n ** 18n;

    before(async function () {
        /** SETUP SCENARIO - NO NEED TO CHANGE ANYTHING HERE */
        [deployer, user, player] = await ethers.getSigners();

        const LenderPoolFactory = await ethers.getContractFactory('NaiveReceiverLenderPool', deployer);
        const FlashLoanReceiverFactory = await ethers.getContractFactory('FlashLoanReceiver', deployer);
        
        pool = await LenderPoolFactory.deploy();
        await deployer.sendTransaction({ to: pool.address, value: ETHER_IN_POOL });
        const ETH = await pool.ETH();
        
        expect(await ethers.provider.getBalance(pool.address)).to.be.equal(ETHER_IN_POOL);
        expect(await pool.maxFlashLoan(ETH)).to.eq(ETHER_IN_POOL);
        expect(await pool.flashFee(ETH, 0)).to.eq(10n ** 18n);

        receiver = await FlashLoanReceiverFactory.deploy(pool.address);
        await deployer.sendTransaction({ to: receiver.address, value: ETHER_IN_RECEIVER });
        await expect(
            receiver.onFlashLoan(deployer.address, ETH, ETHER_IN_RECEIVER, 10n**18n, "0x")
        ).to.be.reverted;
        expect(
            await ethers.provider.getBalance(receiver.address)
        ).to.eq(ETHER_IN_RECEIVER);
    });

    it('Execution', async function () {
        /**
         * The test is designed to exploit the lack of restrictions in the `FlashLoanReceiver`
         * contract's `onFlashLoan` function. Specifically, it targets the fact that:
         * 
         * 1. **No Access Control:** There is no access control on who can initiate a flash loan.
         *    - The `onFlashLoan` function allows anyone to call it with the loanee's address
         *      passed as a parameter. The contract does not restrict who can initiate this
         *      transaction, making it vulnerable to unauthorized calls.
         * 
         * 2. **No Limit on Number of Loans:** The contract does not impose any limit on the
         *    number of flash loans that can be initiated. Therefore, the attacker can repeatedly
         *    trigger flash loans to drain funds.
         */
    
        // The attacker deploys a contract (`AttackNaiveReceiver`) that repeatedly triggers flash loans.
        // The attacker passes the pool and the receiver (FlashLoanReceiver) addresses as parameters.
        const AttackerContractFactory = await ethers.getContractFactory('AttackNaiveReceiver', player);
        await AttackerContractFactory.deploy(pool.address, receiver.address);
    
        /**
         * The `AttackNaiveReceiver` contract is designed to:
         * 
         * 1. **Repeatedly Trigger Flash Loans:** The attacking contract will initiate multiple
         *    flash loans against the `FlashLoanReceiver` contract. Since there is no restriction
         *    on who can call the flash loan function, the attacker can call it as many times as
         *    they want.
         * 
         * 2. **Drain Funds by Paying Fees:** Each flash loan incurs a fee, which must be paid back
         *    along with the principal. The attacker doesn't need to repay the principal out-of-pocket
         *    since the funds are temporarily borrowed, but the fee reduces the contract's balance
         *    each time a loan is taken. Repeatedly doing this will eventually drain all the funds
         *    in the `FlashLoanReceiver` contract.
         * 
         * As the attacker keeps triggering flash loans:
         * - The `FlashLoanReceiver` contract's balance is gradually depleted by the fees paid for
         *   each loan.
         * - Eventually, the contract runs out of funds to pay the fees, effectively draining its
         *   balance.
         * 
         * The vulnerability lies in the fact that anyone can initiate these transactions, and the
         * contract does not have safeguards to prevent excessive loans or unauthorized access.
         */
    });
    

    after(async function () {
        /** SUCCESS CONDITIONS - NO NEED TO CHANGE ANYTHING HERE */

        // All ETH has been drained from the receiver
        expect(
            await ethers.provider.getBalance(receiver.address)
        ).to.be.equal(0);
        expect(
            await ethers.provider.getBalance(pool.address)
        ).to.be.equal(ETHER_IN_POOL + ETHER_IN_RECEIVER);
    });
});
